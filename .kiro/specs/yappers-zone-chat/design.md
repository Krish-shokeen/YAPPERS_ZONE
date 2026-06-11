# Design Document — YAPPERS_ZONE Chat (`yappers-zone-chat`)

## Overview

YAPPERS_ZONE Chat adds a full-featured real-time messaging system on top of the existing Firebase-auth + Express/MongoDB stack. The feature is delivered in six ordered phases:

1. **Authentication bridge** — Firebase ID token → Chat_JWT for Socket.io
2. **1-on-1 Direct Messaging** — real-time plain-text DMs
3. **Group channels + Presence + Typing** — named rooms, online indicators, typing signals
4. **Delivery status + Media/Files + E2E Encryption** — read-receipts, uploads, encrypted DMs
5. **Message search** — full-text + filtered queries
6. **Voice/Video calls** — WebRTC peer connections with signaling relay

The design deliberately extends the existing Express server (no separate service processes in development) while keeping each concern in its own module so that services can be extracted later.

### Key Technology Additions

| Concern | Package | Reason |
|---|---|---|
| Real-time transport | `socket.io` + `socket.io-client` | Bi-directional events, rooms, acknowledgements |
| Presence store | `ioredis` | Fast in-memory key-value with TTL for presence/typing |
| File uploads | `multer` + `multer-s3` (or local `diskStorage`) | Streaming multi-part uploads |
| MIME/malware validation | `file-type` + ClamAV via `clamscan` or SaaS hook | File type sniffing + malware scanning |
| Signed URLs | AWS S3 / MinIO `@aws-sdk/client-s3` | Time-limited media access |
| Search indexing | MongoDB Atlas Search (or `mongodb-text-index`) | Full-text queries on messages collection |
| WebRTC signaling | Native WebRTC in browser + `simple-peer` wrapper | ICE/SDP relay via Socket.io |
| E2E Encryption | `tweetnacl` (NaCl box, X25519 + XSalsa20-Poly1305) | Async key exchange, symmetric message encryption |
| Property-based tests | `fast-check` (Node.js) | Generator-driven property verification |
| Canvas animations | `framer-motion` | Declarative spring/tween animations for node migration, panel transitions, orb reactions |
| Analytics charts | `recharts` | Composable charts for Zone Observation Deck (line + bar) |
| Canvas physics *(optional)* | `pixi.js` | WebGL renderer for Zone_Gravity physics loop when CSS performance is insufficient |

---

## Architecture

### High-Level System Diagram

```mermaid
graph TD
    subgraph Browser
        FC[Firebase Client SDK]
        SC[socket.io-client]
        EC[Encryption_Service\n(tweetnacl, browser)]
        UI[React UI\nSidebar · ChatPane · CallOverlay]
    end

    subgraph Express Server  (main/backend)
        AS[Auth_Service\n/api/chat/token]
        SS[Socket_Server\nsocket.io layer]
        MS[Message_Service]
        PS[Presence_Service]
        MED[Media_Service\nmulter + S3]
        SRCH[Search_Service\nMongo text index]
        WR[WebRTC_Service\nsignaling relay]
    end

    subgraph Data Stores
        MDB[(MongoDB)]
        RDB[(Redis)]
        S3[(Object Store\nS3 / MinIO)]
    end

    FC -- "Firebase ID token" --> AS
    AS -- "Chat_JWT" --> SC
    SC -- "WebSocket + Chat_JWT" --> SS
    SS --> MS --> MDB
    SS --> PS --> RDB
    SS --> WR
    UI --> MED --> S3
    MS --> SRCH --> MDB
```

### Request / Event Flows

**Authentication flow:**
```
Browser                Auth_Service            Firebase Admin
   |  POST /api/chat/token (firebaseIdToken)       |
   |----------------------------------------->     |
   |                    | verifyIdToken()           |
   |                    |-------------------------> |
   |                    | <-- decoded claims        |
   |  <-- { chatJwt }   |                          |
   |                    |                          |
   | socket.io connect (auth: { token: chatJwt })  |
   |-----------------------------------------> Socket_Server
   |                   verifies JWT               |
   |  <-- connected (or auth_error + 4001)        |
```

**DM send flow:**
```
Sender Socket          Socket_Server          Message_Service       Recipient Socket
   | dm:send {to, content}  |                       |                    |
   |----------------------> |                       |                    |
   |                        | insertMessage()        |                    |
   |                        |----------------------> |                    |
   |                        | <-- { messageId }      |                    |
   |                        | dm:receive {msg}        |                    |
   |                        |-------------------------------------------> |
   |                        | <-- ack                                     |
   |                        | updateStatus(delivered) |                    |
   |                        |---------------------->  |                    |
   |  status:update delivered |                       |                    |
   |<-----------------------  |                       |                    |
```

---

## Components and Interfaces

### Backend Modules

#### Auth_Service (`routes/chat-auth.js`)

Extends the existing JWT infrastructure already present in `routes/auth.js`.

```
POST /api/chat/token
  Body: { firebaseIdToken: string }
  Success 200: { chatJwt: string, expiresIn: 86400 }
  Error 401: { code: "AUTH_TOKEN_INVALID" | "AUTH_TOKEN_MISSING", message: string }
```

Internally calls `firebase-admin.auth().verifyIdToken()`, then signs a Chat_JWT via `jsonwebtoken.sign()` with a dedicated `CHAT_JWT_SECRET` env var. The JWT payload carries `{ userId, firebaseUid, email, displayName }`.

Key rotation is implemented with a two-key ring: `CHAT_JWT_SECRET_CURRENT` and `CHAT_JWT_SECRET_PREVIOUS`. On verification the middleware tries the current key first; if that fails it tries the previous key and only accepts it within a 5-minute overlap window stored as `CHAT_JWT_ROTATION_TS`.

#### Socket_Server (`socket/index.js`)

Attaches `socket.io` to the existing `http.Server`. An authentication middleware runs before every connection:

```js
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new ChatError('AUTH_TOKEN_MISSING', 4001));
  try {
    socket.user = jwt.verify(token, process.env.CHAT_JWT_SECRET_CURRENT);
    next();
  } catch (err) {
    /* try previous key within overlap window */
    next(new ChatError('AUTH_TOKEN_INVALID', 4001));
  }
});
```

Event namespaces:
- `/dm` — direct message events
- `/channel` — group channel events
- `/presence` — presence & typing
- `/call` — WebRTC signaling

#### Message_Service (`services/message.service.js`)

Wraps all MongoDB operations on the `messages` and `channels` collections. Exposes:

```ts
insertMessage(payload)         → Promise<Message>
getHistory(conversationId, cursor, limit)  → Promise<{ messages, hasMore }>
updateDeliveryStatus(messageId, status)   → Promise<void>
addReaction(messageId, userId, emoji)     → Promise<ReactionSummary>
removeReaction(messageId, userId, emoji)  → Promise<ReactionSummary>
insertThreadReply(parentId, payload)      → Promise<Message>
```

#### Presence_Service (`services/presence.service.js`)

Uses `ioredis`. Each user's presence is stored as a Redis hash `presence:{userId}` with fields `status`, `lastSeen`, and a TTL of 15 seconds (renewed by heartbeat every 10 s). Typing state is stored as a string key `typing:{conversationId}:{userId}` with a 3-second TTL.

```ts
setOnline(userId)              → Promise<void>
setOffline(userId)             → Promise<void>
getStatuses(userIds: string[]) → Promise<Record<string, 'online'|'offline'>>
setTyping(conversationId, userId, ttlMs)  → Promise<void>
getTyping(conversationId)      → Promise<string[]>   // userIds currently typing
```

#### Media_Service (`services/media.service.js` + `routes/media.js`)

```
POST /api/media/upload
  Multipart form-data: file (max 50 MB)
  Headers: Authorization: Bearer <chatJwt>
  Success 200: { mediaId, signedUrl, name, size, mimeType, status }
  Error 400: { code: "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" }
  Error 503: { code: "SCAN_UNAVAILABLE" }

GET /api/media/:mediaId/url
  Headers: Authorization: Bearer <chatJwt>
  Success 200: { signedUrl, expiresAt }
```

Upload pipeline:
1. `multer` streams bytes to temp storage
2. `file-type` validates MIME type against allowlist
3. Size check (50 MB cap)
4. ClamAV / SaaS scanner invoked asynchronously (or inline for ≤ 10 MB)
5. On scan pass → move to S3, generate 1-hour signed URL, persist `mediaFiles` document
6. On scan fail → quarantine, update status `quarantined`, notify uploader via Socket.io event `media:quarantined`

#### Search_Service (`services/search.service.js` + `routes/search.js`)

```
GET /api/search/messages?q=&sender=&channelId=&fromDate=&toDate=&hasAttachment=&page=
  Headers: Authorization: Bearer <chatJwt>
  Success 200: { results: Message[], total, page, highlight }
  Error 400: { code: "QUERY_INVALID" | "INVALID_DATE_RANGE" }
```

Uses a MongoDB text index on `messages.content` with a compound partial filter index to exclude encrypted messages. Results are ranked by MongoDB text score. Highlights are extracted server-side via a regex over matched terms.

#### WebRTC_Service (`services/webrtc.service.js`)

A pure signaling relay; no media passes through the server. Session state is kept in Redis (key `call:{callId}`) with a 60-second TTL:

```
call:invite  → relay call:incoming to recipient
call:accept  → relay SDP answer to caller
call:ice     → relay ICE candidate to peer
call:end     → emit call:ended, delete session
```

A 30-second miss timer and a 30-second ICE timeout are implemented via Redis `EXPIRE` + a background checker.

---

### Frontend Components

#### New Packages — Cosmic Canvas UI

| Package | Purpose |
|---|---|
| `framer-motion` | Declarative spring/tween animations for node migration, panel transitions, orb reactions |
| `recharts` | Composable chart library for the Zone Observation Deck line and bar charts |
| `pixi.js` *(optional)* | WebGL canvas renderer for Zone_Gravity physics loop when CSS/SVG performance is insufficient |

#### Core Cosmic Canvas Components

| Component | Path | Responsibility |
|---|---|---|
| `CosmicCanvas` | `components/canvas/CosmicCanvas.jsx` | Root canvas container; owns the `requestAnimationFrame` Zone_Gravity physics loop; routes pointer events to child nodes; renders the deep navy base (`#0a0e1a`–`#1c1f2e`) |
| `OrbitalNode` | `components/canvas/OrbitalNode.jsx` | Circular zone node; cyan/magenta glow border driven by `unreadCount`/activity props; activity-based scale via `framer-motion`; unread badge overlay |
| `GalaxyCluster` | `components/canvas/GalaxyCluster.jsx` | Groups a set of `OrbitalNode`s that share a thematic affiliation; applies orbital motion around a shared focal point; renders the cluster label (≥14 px, above focal point) |
| `ZonalNavigationBar` | `components/canvas/ZonalNavigationBar.jsx` | Floating glassmorphism bar at canvas top; Zone Search input; Active / Muted / Friends filter tag controls; updates visible nodes within 300 ms of filter change |
| `CometInput` | `components/canvas/CometInput.jsx` | Floating semi-transparent text input that docks directly below the selected `OrbitalNode`; tracks node position every animation frame (`position = nodePosition + { y: COMET_OFFSET_PX }`); renders trailing light effect during movement via `framer-motion` |
| `YappersHub` | `components/canvas/YappersHub.jsx` | Main hub view; composes `CosmicCanvas`, `GalaxyCluster`s (central-to-mid region), peripheral DM `OrbitalNode`s, `ZonalNavigationBar`, and `Sidebar`; active on root route |
| `ExpandedChatView` | `components/canvas/ExpandedChatView.jsx` | Replaces `ChatPane` for the Cosmic Canvas; large rounded glass container with blurred backdrop and glowing accent edge; teal gradient bubbles (sender) and gray/purple gradient bubbles (others); Unread marker + glowing "Jump to Latest" control; collapsible right context panel with three tabs — Zonal Shared Media, Pinned Messages, Zone Members |
| `CosmicExplorer` | `components/canvas/CosmicExplorer.jsx` | Glass-scope overlay (≥12 px backdrop blur) for zone discovery; Discovery Clusters constellation groupings; Discovery Cards with Join / Learn More actions; Zone Full indicator when capacity reached |
| `ZoneIgnitionSystem` | `components/canvas/ZoneIgnitionSystem.jsx` | Three-panel creation wizard overlay: left form panel (Zone Name, Zone Type, Scale/Range/Gravity sliders), central `IgnitionOrb` panel, right contact-invite toggle panel; step progress nodes animate cyan→magenta on completion |
| `ZoneObservationDeck` | `components/canvas/ZoneObservationDeck.jsx` | Admin dashboard view (owners and moderators only); Daily Chat Volume line chart (30 days, cyan `recharts` lines); User Growth Trends bar chart (12 weeks); dynamic moderation queue with Approve/Remove/Escalate actions; governance toggle panel (Slow Mode, Join Approval, Link Previews, File Uploads) |
| `WhisperStream` | `components/canvas/WhisperStream.jsx` | DM-dedicated view; left contact list (avatar, display name, last timestamp, typing indicator, sorted by recent activity); flowing ribbon light animation (`framer-motion`) connecting user avatar to selected contact; DM transcript overlay following Req 16 bubble/unread rules; `CometInput` docked at transcript bottom |
| `UserProfileSettings` | `components/canvas/UserProfileSettings.jsx` | Full-screen glassmorphism settings page; large cosmic-framed profile card; four-tab navigation (Profile, Appearance & Themes, Notifications, Security); Nebula theme previews (Nebula Blue, Supernova, Deep Violet) with 500 ms full-canvas application; iridescent glowing notification toggles |

#### Legacy Chat Components (preserved, used inside `ExpandedChatView` and `WhisperStream`)

| Component | Path | Responsibility |
|---|---|---|
| `ChatLayout` | `components/chat/ChatLayout.jsx` | Outer split-view grid; manages sidebar collapse state |
| `Sidebar` | `components/chat/Sidebar.jsx` | DM + Channel list; presence dots; unread badges; minimalist translucent left panel with ≥8 px backdrop blur |
| `ChatPane` | `components/chat/ChatPane.jsx` | Message list, header, input bar (used in non-canvas fallback) |
| `MessageBubble` | `components/chat/MessageBubble.jsx` | Individual message with delivery ticks, reactions |
| `TypingIndicator` | `components/chat/TypingIndicator.jsx` | Animated "…is typing" display |
| `MediaUpload` | `components/chat/MediaUpload.jsx` | File picker, progress bar, thumbnail preview |
| `ReactionPicker` | `components/chat/ReactionPicker.jsx` | Emoji grid, reaction toggle |
| `ThreadPanel` | `components/chat/ThreadPanel.jsx` | Slide-over thread replies |
| `CallOverlay` | `components/chat/CallOverlay.jsx` | Floating call UI; mute/video/end controls |
| `useChatSocket` | `hooks/useChatSocket.js` | Socket.io connection, event subscription |
| `usePresence` | `hooks/usePresence.js` | Presence query + live updates |
| `useTyping` | `hooks/useTyping.js` | Debounced typing:start/stop emission |
| `Encryption_Service` | `services/encryption.js` | Key generation, encrypt/decrypt (tweetnacl) |

#### CSS Theme System

Three **Nebula themes** are implemented as CSS variable sets applied to `:root`. Theme switching swaps the entire variable set atomically before the next paint.

```css
/* Shared variable names across all themes */
--color-canvas-bg-start   /* canvas gradient start */
--color-canvas-bg-end     /* canvas gradient end */
--color-surface-1         /* primary glassmorphism panel */
--color-surface-2         /* secondary panel */
--color-accent-primary    /* primary glow / interactive */
--color-accent-secondary  /* secondary accent */
--color-accent-tertiary   /* tertiary accent */
--color-text-primary
--color-text-secondary
--glass-blur              /* backdrop-filter blur value */
--glass-border            /* semi-transparent border color */
--glow-unread             /* unread node border glow */
--glow-active             /* active node border glow */
```

| Variable | Nebula Blue | Supernova | Deep Violet |
|---|---|---|---|
| `--color-canvas-bg-start` | `#0a0e1a` | `#1a0a00` | `#0d0a1a` |
| `--color-canvas-bg-end` | `#1c1f2e` | `#2e1a00` | `#1a0d2e` |
| `--color-accent-primary` | `#00e5ff` | `#ffaa00` | `#bf5fff` |
| `--color-accent-secondary` | `#7b2fff` | `#ff6600` | `#ff6ec7` |
| `--glow-unread` | `#00e5ff` | `#ffcc44` | `#cc88ff` |

**Glassmorphism utility classes:**
```css
.glass-panel {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.12));
  border-radius: 16px;
}

.glow-border-unread  { box-shadow: 0 0 12px 3px var(--glow-unread); }
.glow-border-active  { box-shadow: 0 0 8px 2px var(--glow-active); }
```

#### Zone_Gravity Physics Loop

`CosmicCanvas` runs a `requestAnimationFrame` loop that updates every `OrbitalNode`'s position and scale each frame. The physics contract:

```ts
interface NodePhysicsState {
  position: { x: number; y: number };  // current position in canvas px
  targetPosition: { x: number; y: number };
  scale: number;          // 1.0 = default
  targetScale: number;
  glowIntensity: number;  // 0.0–1.0
}

// Called every frame; returns next state
function stepGravity(
  state: NodePhysicsState,
  activity: number,       // current message-rate + typing count
  unreadCount: number,
  canvasCenter: { x: number; y: number },
  deltaMs: number
): NodePhysicsState;
```

Rules encoded in `stepGravity`:
1. `targetScale` increases proportionally with `activity`; scale converges within 500 ms.
2. When `activity === 0` for ≥ 30 000 ms, `targetScale` returns to `1.0`; scale converges within 2 000 ms.
3. When `unreadCount > 0` or `activity > 0`, `targetPosition` moves toward `canvasCenter`.
4. When both drop to 0, `targetPosition` moves toward the canvas periphery.
5. `position` and `scale` interpolate toward their targets each frame (spring lerp).

#### `CometInput` Position Contract

```ts
const COMET_OFFSET_PX = 72;   // fixed vertical offset below node center

// Evaluated every animation frame
function cometPosition(nodePosition: { x: number; y: number }) {
  return { x: nodePosition.x, y: nodePosition.y + COMET_OFFSET_PX };
}
```

The `CometInput` subscribes to the `CosmicCanvas` physics loop and re-renders its `transform` each frame, ensuring it always satisfies `cometPosition.y === nodePosition.y + COMET_OFFSET_PX` (Property 43).

#### Socket hook interface (`useChatSocket`)

```js
const {
  sendDm, sendChannelMessage,
  joinChannel, leaveChannel,
  markRead, updateTyping,
  on, off       // event subscription
} = useChatSocket({ chatJwt });
```

---

## Data Models

### MongoDB Collections

#### `messages`

```js
{
  _id: ObjectId,
  messageId: String,        // UUIDv4, unique index
  senderId: ObjectId,       // ref: users
  recipientId: ObjectId,    // ref: users — null for channel messages
  channelId: ObjectId,      // ref: channels — null for DMs
  parentMessageId: ObjectId,// ref: messages — null for top-level; set for thread replies
  content: String,          // plaintext; null when encryptedPayload is set
  encryptedPayload: String, // base64 ciphertext; null for plaintext messages
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  mediaAttachments: [{ mediaId: ObjectId, mimeType: String, name: String, size: Number }],
  reactions: [{
    emoji: String,
    userIds: [ObjectId]     // users who reacted with this emoji
  }],
  isEncrypted: Boolean,
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
- `{ channelId: 1, createdAt: -1 }` — channel history pagination
- `{ senderId: 1, recipientId: 1, createdAt: -1 }` — DM history pagination
- `{ parentMessageId: 1, createdAt: -1 }` — thread replies
- `{ messageId: 1 }` unique — delivery status lookup
- Text index `{ content: "text" }` with partial filter `{ isEncrypted: false }` — search

#### `channels`

```js
{
  _id: ObjectId,
  name: String,           // 3–80 chars, unique (case-insensitive, collation)
  nameLower: String,      // lowercase copy for collation-free duplicate check
  description: String,    // up to 500 chars
  createdBy: ObjectId,    // ref: users
  memberCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
- `{ nameLower: 1 }` unique

#### `channelMembers`

```js
{
  _id: ObjectId,
  channelId: ObjectId,    // ref: channels
  userId: ObjectId,       // ref: users
  role: { type: String, enum: ['owner', 'member'] },
  joinedAt: Date
}
```

Indexes:
- `{ channelId: 1, userId: 1 }` unique — membership check
- `{ userId: 1, channelId: 1 }` — fetch user's channels

#### `mediaFiles`

```js
{
  _id: ObjectId,
  mediaId: String,        // UUIDv4
  uploaderId: ObjectId,   // ref: users
  originalName: String,
  mimeType: String,
  size: Number,           // bytes
  storageKey: String,     // S3 / MinIO object key
  status: {
    type: String,
    enum: ['scan_pending', 'available', 'quarantined']
  },
  signedUrlExpiry: Date,
  createdAt: Date
}
```

#### `encryptionKeys`

```js
{
  _id: ObjectId,
  userId: ObjectId,       // ref: users, unique
  publicKey: String,      // base64 X25519 public key
  createdAt: Date,
  updatedAt: Date
}
```

Index: `{ userId: 1 }` unique

#### `searchIndex` (virtual — backed by MongoDB text index on `messages`)

No separate collection. The text index on `messages.content` with the partial filter `{ isEncrypted: false }` serves as the search index. For queries exceeding Atlas Search requirements, a dedicated `searchIndex` collection with `{ messageId, snippet, tokens[] }` can be introduced later.

### Redis Key Schema

| Key pattern | Type | TTL | Purpose |
|---|---|---|---|
| `presence:{userId}` | Hash (`status`, `lastSeen`) | 15 s | Online status |
| `typing:{convId}:{userId}` | String | 3 s | Active typing flag |
| `call:{callId}` | Hash (caller, recipient, state) | 60 s | Pending call session |
| `chatjwt:rotation:ts` | String (unix timestamp) | – | Key rotation overlap window start |

---

## Socket.io Event Contracts

### DM Events

| Event | Direction | Payload |
|---|---|---|
| `dm:send` | client → server | `{ to: userId, content: string, encryptedPayload?: string }` |
| `dm:receive` | server → client | `{ messageId, from: userId, content, encryptedPayload, createdAt, deliveryStatus }` |
| `dm:error` | server → client | `{ code: string, message: string }` |

### Channel Events

| Event | Direction | Payload |
|---|---|---|
| `channel:join` | client → server | `{ channelId }` |
| `channel:leave` | client → server | `{ channelId }` |
| `channel:send` | client → server | `{ channelId, content }` |
| `channel:message` | server → client | `{ messageId, channelId, from: userId, content, createdAt }` |
| `channel:error` | server → client | `{ code: string, message: string }` |

### Presence & Typing Events

| Event | Direction | Payload |
|---|---|---|
| `presence:update` | server → client | `{ userId, status: 'online'|'offline' }` |
| `typing:start` | client → server | `{ conversationId }` |
| `typing:stop` | client → server | `{ conversationId }` |
| `typing:started` | server → client | `{ conversationId, userId, displayName }` |
| `typing:stopped` | server → client | `{ conversationId, userId }` |

### Delivery Status Events

| Event | Direction | Payload |
|---|---|---|
| `status:read` | client → server | `{ messageId }` |
| `status:update` | server → client | `{ messageId, status: 'delivered'|'read' }` |

### Reaction Events

| Event | Direction | Payload |
|---|---|---|
| `reaction:add` | client → server | `{ messageId, emoji }` |
| `reaction:remove` | client → server | `{ messageId, emoji }` |
| `reaction:update` | server → client | `{ messageId, reactions: [{emoji, count, userIds}] }` |

### Call Events

| Event | Direction | Payload |
|---|---|---|
| `call:invite` | client → server | `{ recipientId, sdpOffer, callType: 'audio'|'video' }` |
| `call:incoming` | server → client | `{ callId, from: userId, sdpOffer, callType }` |
| `call:accept` | client → server | `{ callId, sdpAnswer }` |
| `call:ice` | client → server | `{ callId, candidate }` |
| `call:end` | client → server | `{ callId }` |
| `call:ended` | server → client | `{ callId }` |
| `call:missed` | server → client | `{ callId }` |
| `call:busy` | server → client | `{ callId }` |
| `call:error` | server → client | `{ callId, code: string }` |

---

## Error Handling

### Backend Error Strategy

All REST endpoints and Socket.io event handlers follow a consistent error shape:

```json
{ "code": "MACHINE_READABLE_CODE", "message": "Human readable detail" }
```

**Layered error handling:**
- `Message_Service` throws typed `ChatError` objects with `code`, `statusCode`, and `message`
- Socket event handlers catch these and emit the appropriate `*:error` event
- Express REST handlers catch and map to HTTP status codes
- Unhandled errors are caught by the Express error middleware and logged; a generic `INTERNAL_ERROR` response is returned to the client

**Resilience patterns:**
- Presence_Service writes retry up to 3× at 1-second intervals (Req 5.5)
- Media scans that fail mark file `scan_pending` and re-queue in a Redis list for retry within 60 s (Req 8.8)
- Offline delivery: messages with status `sent` are flushed to the recipient on reconnect; missed `status:update` events are re-emitted within 5 s of sender reconnect (Req 7.7)

### Frontend Error Strategy

- Socket connection failures display a non-blocking toast notification and trigger exponential back-off reconnect (1 s → 2 s → 4 s, max 30 s)
- `dm:error` / `channel:error` events display an inline error under the message input
- Decryption failures display the "⚠ Could not decrypt message" inline error in MessageBubble (Req 9.5)
- Media upload failures display an inline error with a retry button in MediaUpload

---

## Testing Strategy

### Unit Tests

**Test runner:** Vitest (frontend) + Jest / Node test runner (backend)

Focus areas for unit tests:
- `Auth_Service` — JWT sign/verify logic, key rotation overlap window
- `Message_Service` — pagination cursor logic, reaction cap (20 emoji), thread reply insertion
- `Search_Service` — query validation (length, date range), filter composition
- `Media_Service` — MIME allowlist, size thresholds, URL signing
- `Encryption_Service` (browser) — key-pair generation, encrypt/decrypt round-trip
- `Presence_Service` — Redis TTL logic, retry logic

### Property-Based Tests

**Library:** `fast-check` (works in both Node.js and Vitest browser tests)

**Configuration:** minimum 100 iterations per property run.

Each property test references its design property with a comment tag:
```js
// Feature: yappers-zone-chat, Property N: <property text>
```

Property-based tests are detailed in the **Correctness Properties** section below.

### Integration Tests

- Socket.io event flows tested with `socket.io-client` against a real (test) Express server and MongoDB/Redis in Docker
- Media upload pipeline tested end-to-end against MinIO (local S3-compatible)
- WebRTC signaling relay tested with two mock socket clients exchanging SDP/ICE

### UI Tests

- Sidebar collapse animation timing (CSS transition duration assertions)
- MessageBubble alignment (sent = right, received = left)
- Dark mode theme application on `prefers-color-scheme` change via `window.matchMedia` mock
- Typing indicator display / dismissal timing


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The properties below were derived by analyzing every acceptance criterion in `requirements.md` using the classification process above. Criteria classified as EXAMPLE, EDGE_CASE, INTEGRATION, or SMOKE are covered by unit/integration tests in the Testing Strategy; only PROPERTY-classified criteria produce entries here.

**Property reflection summary:** Redundant properties were consolidated before writing this section. Specifically: socket auth-error cases (1.4 + 1.5) are merged; pagination completeness criteria (3.1 + 3.2 + 3.3) are merged; presence connect/disconnect lifecycle criteria (5.1 + 5.2 + 5.3) are merged; delivery-status lifecycle criteria (7.1 + 7.2 + 7.4 + 7.5 + 7.8) are merged; file validation accept/reject criteria (8.1 + 8.2) are merged; encryption round-trip criteria (9.3 + 9.4) are merged; and thread reply validation (14.6) is subsumed by the general content-validation property (2.4).

---

### Property 1: Chat_JWT payload completeness

*For any* valid user record (with userId, firebaseUid, email, displayName), a Chat_JWT signed by Auth_Service must decode to a payload containing all four fields with values matching the input record, and the token's `exp` claim must equal `iat + 86400`.

**Validates: Requirements 1.1**

---

### Property 2: Invalid tokens always rejected at the socket layer

*For any* string that is not a syntactically valid, unexpired Chat_JWT signed with the current signing key (including empty string, random bytes, expired tokens, and tokens with wrong signatures), a socket.io connection attempt using that string as `auth.token` must always result in an `auth_error` event being emitted to the client and the connection being closed with code 4001.

**Validates: Requirements 1.4, 1.5**

---

### Property 3: Key rotation overlap window

*For any* Chat_JWT signed with the immediately previous signing key and a creation time `t`, the Auth_Service must accept the token when `(now - t) < 300 s` and must reject it when `(now - t) >= 300 s`, regardless of the token's content.

**Validates: Requirements 1.6**

---

### Property 4: Message schema invariant

*For any* valid message payload (senderId, content 1–4000 chars, and either recipientId or channelId), after `Message_Service.insertMessage()` completes, the stored document must contain a `messageId` that is a valid UUIDv4, a `deliveryStatus` of `sent`, a non-null `senderId`, a non-null `createdAt`, and either a non-null `recipientId` or a non-null `channelId` — with all other required fields present and non-undefined.

**Validates: Requirements 2.3, 2.5, 7.1**

---

### Property 5: Content length validation (messages and thread replies)

*For any* string of length 0 (including whitespace-only) or length greater than 4000 characters, any attempt to send it as a DM, channel message, or thread reply must be rejected with the appropriate invalid-content error code (`MESSAGE_INVALID` or `THREAD_REPLY_INVALID`), and no document must be inserted into the `messages` collection.

**Validates: Requirements 2.4, 14.6**

---

### Property 6: Pagination correctness and termination

*For any* conversation containing N messages and *for any* valid cursor value C, a pagination request with cursor C must: (a) return only messages with `createdAt` strictly less than C; (b) return at most 50 messages; (c) return messages in descending order by `createdAt`; and (d) include `hasMore: false` in the response whenever the returned count is less than 50.

**Validates: Requirements 3.1, 3.2, 3.3**

---

### Property 7: History access control

*For any* userId U and conversation ID V where U is not recorded as a participant in V, `Message_Service.getHistory(V, ...)` called with U's credentials must return an unauthorized error and must not return any message documents.

**Validates: Requirements 3.5**

---

### Property 8: Channel name uniqueness (case-insensitive)

*For any* channel name N that already exists in the `channels` collection (in any casing), a channel creation request using any case variant of N must be rejected with error code `CHANNEL_NAME_TAKEN` and no new Channel document must be created.

**Validates: Requirements 4.2**

---

### Property 9: Channel non-member send rejection

*For any* userId U and channelId C where U is not present in `channelMembers` for C, a `channel:send` event from U targeting C must be rejected with error code `NOT_A_MEMBER` and no message document must be persisted.

**Validates: Requirements 4.5**

---

### Property 10: Channel capacity enforcement

*For any* channel already containing exactly 1,000 members, any subsequent `channel:join` event must be rejected with error code `CHANNEL_FULL`, and the member count must remain 1,000.

**Validates: Requirements 4.7**

---

### Property 11: Presence lifecycle round-trip

*For any* userId U: (a) after U establishes a socket connection, `Presence_Service.getStatuses([U])` must return `{ [U]: 'online' }` and a `presence:update { userId: U, status: 'online' }` event must have been broadcast to all contacts; (b) after U disconnects (cleanly or via TTL expiry after 10 s of no heartbeat), `getStatuses([U])` must return `{ [U]: 'offline' }` and a `presence:update { userId: U, status: 'offline' }` must have been broadcast.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

---

### Property 12: Presence query completeness

*For any* set S of up to 500 userIds, `Presence_Service.getStatuses(S)` must return a map with exactly one entry per userId in S, where each entry's value is either `'online'` or `'offline'`.

**Validates: Requirements 5.6**

---

### Property 13: Presence write retry

*For any* Redis write that fails N consecutive times (N ∈ {1, 2, 3}), the Presence_Service must retry until success. For N = 4 (all 3 retries exhausted), the Presence_Service must log the error and continue without throwing, leaving the caller unblocked.

**Validates: Requirements 5.5**

---

### Property 14: Typing indicator throttle

*For any* sequence of keypress timestamps spanning a total duration D milliseconds, the number of `typing:start` events emitted by the Chat_Pane must not exceed `floor(D / 2000) + 1`, and no `typing:start` event must be emitted after the user has not typed for 3 or more consecutive seconds.

**Validates: Requirements 6.1**

---

### Property 15: Typing indicator display threshold

*For any* set of N userIds simultaneously typing in a channel: when N ∈ {1, 2, 3}, the Chat_Pane must display each of the N users' `displayName`s individually; when N > 3, the Chat_Pane must display exactly "Several people are typing…" instead of any individual display names.

**Validates: Requirements 6.8**

---

### Property 16: Delivery status lifecycle

*For any* message M inserted by Message_Service: (a) the initial `deliveryStatus` must be `sent`; (b) after a socket-level acknowledgement is received from the recipient, `deliveryStatus` must transition to `delivered`; (c) after `status:read` is received for M's `messageId`, `deliveryStatus` must transition to `read`; (d) for any message where no socket acknowledgement is received within 10 seconds of emission, `deliveryStatus` must remain `sent`; (e) `status:read` for a given `messageId` must be emitted at most once, regardless of how many times the message scrolls into view.

**Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.8**

---

### Property 17: Media file validation

*For any* file with MIME type T and size S: the Media_Service must accept the file if and only if T ∈ {`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/webm`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`} AND S ≤ 52,428,800 bytes (50 MB). For all other (T, S) combinations the service must reject with an appropriate error code and must not store the file.

**Validates: Requirements 8.1, 8.2**

---

### Property 18: Media upload response completeness

*For any* accepted file upload, the Media_Service response must contain a `mediaId` (UUIDv4), a non-empty `signedUrl` string, the original `name`, the correct `size` in bytes, and the validated `mimeType`.

**Validates: Requirements 8.3**

---

### Property 19: Media accessibility gating

*For any* uploaded file, the file's `status` must never be `available` at any point before a malware scan has passed. Specifically: immediately after upload the status must be either `scan_pending` (scanner unavailable) or transition through `scan_pending → available` (scanner passes) or `scan_pending → quarantined` (scanner fails) — never skipping the scan step.

**Validates: Requirements 8.6, 8.8**

---

### Property 20: Media rendering by MIME type

*For any* `mediaAttachment` with MIME type T, the Chat_Pane's media renderer must render: an `<img>` thumbnail when T ∈ {`image/jpeg`, `image/png`, `image/gif`, `image/webp`}; an HTML5 `<video>` player when T ∈ {`video/mp4`, `video/webm`}; and a file-attachment element with a download icon for all other allowed MIME types.

**Validates: Requirements 8.5**

---

### Property 21: E2E encryption round-trip

*For any* plaintext message string P and *for any* pair of X25519 key pairs (sender key pair, recipient key pair), encrypting P with the recipient's public key and sender's private key, then decrypting the resulting ciphertext with the recipient's private key must yield a result exactly equal to P. This property must hold for P of any length, encoding, or content including empty strings, Unicode, and binary-safe byte sequences.

**Validates: Requirements 9.3, 9.4**

---

### Property 22: E2E storage invariant

*For any* message M where `isEncrypted === true`, the stored MongoDB document must have `content` set to `null` and `encryptedPayload` set to a non-null, non-empty string. The plaintext content must not appear in any field of the stored document.

**Validates: Requirements 9.7**

---

### Property 23: Search precision — plaintext only

*For any* search query Q executed against a dataset containing both plaintext and encrypted messages, every message in the returned results must have `isEncrypted === false`. No message with `isEncrypted === true` must appear in any result set for any query.

**Validates: Requirements 10.6**

---

### Property 24: Search filter AND-logic

*For any* combination of one or more search filters (sender, conversation, date range, attachment flag), every message returned by Search_Service must satisfy all of the provided filters simultaneously. No returned message may fail any single applied filter.

**Validates: Requirements 10.2**

---

### Property 25: Search query validation

*For any* query string Q: if `length(Q) < 2` or `length(Q) > 200`, the Search_Service must return error code `QUERY_INVALID` and must not execute the query or return any results; if a date-range filter is provided with `fromDate > toDate`, the Search_Service must return error code `INVALID_DATE_RANGE` and must not execute the query.

**Validates: Requirements 10.5, 10.3**

---

### Property 26: Search highlight correctness

*For any* search result that includes a `highlight` field, the highlight must contain the matched query term(s) and each highlighted context snippet must not exceed 100 characters.

**Validates: Requirements 10.4**

---

### Property 27: WebRTC call cleanup on end

*For any* active call session with callId C, when a `call:end` event is emitted by either participant: the other participant must receive a `call:ended` event; the Redis key `call:{C}` must be deleted; and no further events for session C must be relayed.

**Validates: Requirements 11.4**

---

### Property 28: WebRTC busy guard

*For any* userId U who has an active call session, any `call:invite` event targeting U as recipient must result in a `call:busy` event emitted to the caller, and the invite must not be relayed to U. This must hold for any number of concurrent callers attempting to reach U simultaneously.

**Validates: Requirements 11.8**

---

### Property 29: Sidebar conversation item rendering

*For any* conversation object with fields `name`, `lastMessage`, `timestamp`, and `unreadCount`, the rendered Sidebar conversation item must: display `name`; display `lastMessage` truncated to at most 60 characters; display a relative time string when the message timestamp is within the past 24 hours and an absolute date string otherwise; and display the unread badge only when `unreadCount > 0`.

**Validates: Requirements 12.1**

---

### Property 30: Active conversation click idempotence

*For any* scroll position P in the Chat_Pane, clicking the Sidebar entry for the currently active conversation must leave the scroll position unchanged at P and must not trigger a conversation reload.

**Validates: Requirements 12.3**

---

### Property 31: Message bubble alignment

*For any* message M and *for any* current user ID U: if `M.senderId === U`, the MessageBubble component must apply the right-aligned accent-color bubble style; if `M.senderId !== U`, it must apply the left-aligned neutral-color bubble style.

**Validates: Requirements 12.5**

---

### Property 32: Dark mode color range

*For any* surface-level UI element rendered while dark mode is active, the computed CSS `background-color` must be a color with luminance within the range defined by `#1a1a2e` (lower bound) to `#2d2d44` (upper bound), and must not equal `#000000`. The contrast ratio between the element's text color and its background must be at least 4.5:1.

**Validates: Requirements 13.2, 13.5**

---

### Property 33: Light mode color range

*For any* surface-level UI element rendered while light mode is active, the computed CSS `background-color` must be within the range `#f5f5f5` to `#ffffff`. The contrast ratio between the element's text color and its background must be at least 4.5:1.

**Validates: Requirements 13.3, 13.5**

---

### Property 34: Reaction cap invariant

*For any* message M and *for any* sequence of `reaction:add` operations applied to M, the count of distinct emoji on M must never exceed 20. Any `reaction:add` for a 21st distinct emoji must be rejected, and the existing 20 reactions must remain unchanged.

**Validates: Requirements 14.1**

---

### Property 35: Reaction toggle round-trip

*For any* message M, user U, and emoji E: if U adds reaction E and then adds it again (toggle-remove), the resulting reaction state of M must be identical to the state before U's first addition. Specifically, U must not appear in the `userIds` list for E after the second add, and the total count for E must have returned to its pre-first-add value.

**Validates: Requirements 14.2**

---

### Property 36: Thread pagination correctness

*For any* parent message with N thread replies and *for any* cursor C, the Thread_Panel's pagination must return only replies with `createdAt < C` in descending order, at most 50 per page, with `hasMore: false` when fewer than 50 results are returned.

**Validates: Requirements 14.4**

---

### Property 37: Thread reply schema integrity

*For any* valid thread reply payload (content 1–4000 chars, parentMessageId referencing an existing message), after `Message_Service.insertThreadReply()` completes, the stored document must have `parentMessageId` equal to the specified parent's `messageId`, a valid UUIDv4 `messageId`, and all required message fields present.

**Validates: Requirements 14.5**

---

### Property 38: Zone_Gravity scaling responsiveness

*For any* `OrbitalNode` with an initial activity level A₀, when the activity level increases to A₁ > A₀ (due to an increase in message rate or active Typing_Indicator count), the node's computed `scale` value as produced by `stepGravity` must be strictly greater than its scale at A₀, and the scale must reach its new `targetScale` within 500 ms. Conversely, when a Zone has been inactive for ≥ 30 000 ms, `targetScale` must return to `1.0` and the scale must converge within 2 000 ms.

**Validates: Requirements 12.2**

---

### Property 39: Unread glow invariant

*For any* `OrbitalNode` rendered with `unreadCount > 0`, the applied `--glow-unread` CSS variable resolved on that node's border must be a color whose hue is within ±10% of electric cyan (`#00e5ff`, hue ≈ 191°). No node with `unreadCount === 0` may display the unread glow border.

**Validates: Requirements 12.3**

---

### Property 40: Filter tag isolation

*For any* active filter tag selection (Active, Muted, or Friends) applied via `ZonalNavigationBar`, every `OrbitalNode` that is currently visible on the `CosmicCanvas` must satisfy the predicate corresponding to the selected filter. No node that fails the active filter predicate may be visible in the rendered canvas.

**Validates: Requirements 12.8**

---

### Property 41: Theme completeness on switch

*For any* theme selection from the set {Nebula Blue, Supernova, Deep Violet} applied via the `UserProfileSettings` Appearance panel, all defined CSS surface variables (`--color-canvas-bg-start`, `--color-canvas-bg-end`, `--color-surface-1`, `--color-surface-2`, `--color-accent-primary`, `--color-accent-secondary`, `--color-accent-tertiary`, `--color-text-primary`, `--color-text-secondary`, `--glass-blur`, `--glass-border`, `--glow-unread`, `--glow-active`) must be updated to the theme-specific values before the next browser paint, and in all cases within 500 ms of the selection event.

**Validates: Requirements 21.5**

---

### Property 42: Step ignition monotonicity

*For any* sequence of step completions in the `ZoneIgnitionSystem` wizard, the color state of each step node must be monotonically non-decreasing along the cyan→magenta progression. Specifically: a step node that has transitioned to magenta (`#ff6ec7`) must never revert to cyan (`#00e5ff`) or any intermediate color. For any completed step S at any point in the wizard session, `stepColor(S) === '#ff6ec7'` must hold invariably.

**Validates: Requirements 18.5**

---

### Property 43: Comet_Input position tracking

*For any* selected `OrbitalNode` at canvas position `(x, y)` and *for any* animation frame during which that node is selected, the `CometInput` component's rendered position must satisfy `cometX === x` and `cometY === y + COMET_OFFSET_PX` (where `COMET_OFFSET_PX` is the fixed vertical offset constant defined in the `CometInput` position contract). This must hold for every frame in the `requestAnimationFrame` physics loop, including frames where Zone_Gravity has moved the node from its previous position.

**Validates: Requirements 12.6**
