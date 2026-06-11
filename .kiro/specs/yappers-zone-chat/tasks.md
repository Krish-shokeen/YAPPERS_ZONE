# Implementation Plan: YAPPERS_ZONE Chat (`yappers-zone-chat`)

## Overview

Implements a full-featured real-time chat system on top of the existing Firebase-auth + Express/MongoDB
stack. Work is divided into six ordered phases (auth bridge → DMs → group channels/presence/typing →
delivery/media/E2E → search → WebRTC) plus a cross-cutting Cosmic Canvas UI layer. Each phase builds
on the previous one; no orphaned code is left un-wired.

Backend test runner: **Jest** (Node ESM). Frontend test runner: **Vitest**.  
Property-based test library: **fast-check** (both environments).

---

## Tasks

### Phase 1 — Authentication Bridge

- [ ] 1. Install backend chat dependencies and configure environment
  - Add `socket.io`, `ioredis`, `multer`, `tweetnacl`, `fast-check`, `uuid`, `file-type` to
    `main/backend/package.json` (pinned versions)
  - Add `jest`, `@jest/globals` as dev dependencies; add `"test": "node --experimental-vm-modules node_modules/.bin/jest"` script
  - Add `CHAT_JWT_SECRET_CURRENT`, `CHAT_JWT_SECRET_PREVIOUS`, `CHAT_JWT_ROTATION_TS`,
    `REDIS_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CLAMAV_HOST`
    entries to `.env.example`
  - Create `main/backend/chat-errors.js` — exports typed `ChatError(code, statusCode, message)`
    class
  - _Requirements: 1.1_

- [ ] 2. Implement Auth_Service — Chat_JWT issuance and key rotation
  - [ ] 2.1 Create `routes/chat-auth.js`
    - `POST /api/chat/token` — validate body, call `firebase-admin.auth().verifyIdToken()`, sign
      Chat_JWT (payload: `userId`, `firebaseUid`, `email`, `displayName`; `exp: iat + 86400`) with
      `CHAT_JWT_SECRET_CURRENT`
    - Return `{ chatJwt, expiresIn: 86400 }` on success; `AUTH_TOKEN_INVALID` (401) or
      `AUTH_TOKEN_MISSING` (401) on failure
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 2.2 Create `middleware/chatAuth.js`
    - Verify Chat_JWT: try `CHAT_JWT_SECRET_CURRENT`; on failure, try `CHAT_JWT_SECRET_PREVIOUS`
      only if `Date.now()/1000 - CHAT_JWT_ROTATION_TS < 300`; otherwise reject
    - Attach decoded claims to `req.user` / `socket.user`
    - _Requirements: 1.4, 1.5, 1.6_
  - [ ] 2.3 Mount `chat-auth` router in `server.js`; export `chatAuthMiddleware` from
    `middleware/chatAuth.js` for use by Socket_Server
    - Wire `app.use('/api/chat', chatAuthRouter)`
    - _Requirements: 1.1_
  - [ ]* 2.4 Write property test for Chat_JWT payload completeness
    - **Property 1: Chat_JWT payload completeness**
    - **Validates: Requirements 1.1**
    - File: `tests/unit/chat-auth.property.test.js`
  - [ ]* 2.5 Write property test for invalid-token rejection at socket layer
    - **Property 2: Invalid tokens always rejected at the socket layer**
    - **Validates: Requirements 1.4, 1.5**
    - File: `tests/unit/chat-auth.property.test.js`
  - [ ]* 2.6 Write property test for key rotation overlap window
    - **Property 3: Key rotation overlap window**
    - **Validates: Requirements 1.6**
    - File: `tests/unit/chat-auth.property.test.js`

- [ ] 3. Bootstrap Socket_Server and DM namespace
  - [ ] 3.1 Create `socket/index.js`
    - Attach `socket.io` to the existing `http.Server` exported from `server.js`
    - Register `chatAuthMiddleware` as Socket.io auth middleware (emits `auth_error` + closes with
      code 4001 on failure)
    - Export `io` instance for use by other services
    - _Requirements: 1.4, 1.5_
  - [ ] 3.2 Initialize Socket_Server in `server.js`
    - Import and call socket bootstrap after `httpServer` is created
    - _Requirements: 1.4_

- [ ] 4. Checkpoint — Auth phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests added so far pass.
    Ask the user if any questions arise.

---

### Phase 2 — Real-Time 1-on-1 DMs + Persistent Chat History

- [ ] 5. Implement Message_Service — core persistence and pagination
  - [ ] 5.1 Create `services/message.service.js`
    - Define Mongoose schemas for `messages`, `channels`, `channelMembers` collections (fields per
      design data models section)
    - Create all MongoDB indexes defined in the design (`channelId+createdAt`, `senderId+recipientId+createdAt`,
      `parentMessageId+createdAt`, unique `messageId`, text index on `content` with partial filter)
    - Implement `insertMessage(payload) → Promise<Message>` — assign UUIDv4 `messageId`, set
      `deliveryStatus: 'sent'`, set `createdAt` / `updatedAt`
    - Implement `getHistory(conversationId, cursor, limit=50) → Promise<{ messages, hasMore }>`
      cursor-based pagination (descending by `createdAt`, strict-less-than cursor)
    - Implement `updateDeliveryStatus(messageId, status) → Promise<void>`
    - _Requirements: 2.3, 2.5, 3.1, 3.2, 3.3, 3.6, 7.1_
  - [ ]* 5.2 Write property test for Message schema invariant
    - **Property 4: Message schema invariant**
    - **Validates: Requirements 2.3, 2.5, 7.1**
    - File: `tests/unit/message.service.property.test.js`
  - [ ]* 5.3 Write property test for content length validation
    - **Property 5: Content length validation (messages and thread replies)**
    - **Validates: Requirements 2.4, 14.6**
    - File: `tests/unit/message.service.property.test.js`
  - [ ]* 5.4 Write property test for pagination correctness and termination
    - **Property 6: Pagination correctness and termination**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - File: `tests/unit/message.service.property.test.js`
  - [ ]* 5.5 Write property test for history access control
    - **Property 7: History access control**
    - **Validates: Requirements 3.5**
    - File: `tests/unit/message.service.property.test.js`

- [ ] 6. Implement DM Socket.io event handlers
  - [ ] 6.1 Create `socket/handlers/dm.handler.js`
    - Handle `dm:send`: validate `to` and `content` (1–4000 chars); call
      `Message_Service.insertMessage()`; emit `dm:receive` to recipient room; on socket-level ack
      call `updateDeliveryStatus('delivered')`; emit `status:update delivered` to sender
    - Handle offline delivery: on user connect, flush `deliveryStatus: 'sent'` messages via
      `dm:receive`, set `delivered`
    - Emit `dm:error` with `MESSAGE_INVALID` on bad content; `MESSAGE_PERSIST_FAILED` on DB error
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_
  - [ ] 6.2 Register `/dm` namespace handlers in `socket/index.js`
    - Import and wire `dm.handler.js` to the `/dm` namespace
    - _Requirements: 2.1_

- [ ] 7. Checkpoint — DM phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests pass.
    Ask the user if any questions arise.

---

### Phase 3 — Group Channels + Presence + Typing Indicators

- [ ] 8. Implement Channel CRUD and channel Socket.io handlers
  - [ ] 8.1 Create `routes/channels.js`
    - `POST /api/channels` — create channel (name 3–80 chars alphanumeric+hyphens, optional
      description ≤500 chars); case-insensitive duplicate check via `nameLower`; reject with
      `CHANNEL_NAME_TAKEN` if duplicate; add creator as `owner`
    - `GET /api/channels` — list channels the requesting user is a member of
    - _Requirements: 4.1, 4.2_
  - [ ] 8.2 Create `socket/handlers/channel.handler.js`
    - Handle `channel:join`: membership check, capacity check (1,000 max → `CHANNEL_FULL`),
      add to Socket.io room + `channelMembers`; reject unknown `channelId` with `CHANNEL_NOT_FOUND`
    - Handle `channel:leave`: remove from room + update membership
    - Handle `channel:send`: verify membership (`NOT_A_MEMBER` if absent), validate content,
      call `insertMessage()`, broadcast `channel:message` to room within 300 ms
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ] 8.3 Register `/channel` namespace and mount `channels.js` router in `server.js`
    - _Requirements: 4.1_
  - [ ]* 8.4 Write property test for channel name uniqueness
    - **Property 8: Channel name uniqueness (case-insensitive)**
    - **Validates: Requirements 4.2**
    - File: `tests/unit/channel.property.test.js`
  - [ ]* 8.5 Write property test for channel non-member send rejection
    - **Property 9: Channel non-member send rejection**
    - **Validates: Requirements 4.5**
    - File: `tests/unit/channel.property.test.js`
  - [ ]* 8.6 Write property test for channel capacity enforcement
    - **Property 10: Channel capacity enforcement**
    - **Validates: Requirements 4.7**
    - File: `tests/unit/channel.property.test.js`

- [ ] 9. Implement Presence_Service
  - [ ] 9.1 Create `services/presence.service.js`
    - Connect `ioredis` client using `REDIS_URL`
    - Implement `setOnline(userId)` — store `presence:{userId}` hash (`status`, `lastSeen`) with
      15 s TTL; retry up to 3× at 1 s intervals on failure; log + swallow on 4th failure
    - Implement `setOffline(userId)` — delete key; same retry logic
    - Implement `getStatuses(userIds[]) → Record<userId, 'online'|'offline'>` — batch Redis
      `HGET`; return `'offline'` for missing keys; respond within 100 ms
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 9.2 Create `socket/handlers/presence.handler.js`
    - On socket connect: call `setOnline`, broadcast `presence:update { online }` to contact rooms
    - On socket disconnect / heartbeat timeout (10 s): call `setOffline`, broadcast
      `presence:update { offline }`
    - Handle presence query requests from frontend (initial Sidebar load)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8_
  - [ ] 9.3 Register `/presence` namespace in `socket/index.js`
    - _Requirements: 5.1_
  - [ ]* 9.4 Write property test for presence lifecycle round-trip
    - **Property 11: Presence lifecycle round-trip**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - File: `tests/unit/presence.service.property.test.js`
  - [ ]* 9.5 Write property test for presence query completeness
    - **Property 12: Presence query completeness**
    - **Validates: Requirements 5.6**
    - File: `tests/unit/presence.service.property.test.js`
  - [ ]* 9.6 Write property test for presence write retry
    - **Property 13: Presence write retry**
    - **Validates: Requirements 5.5**
    - File: `tests/unit/presence.service.property.test.js`

- [ ] 10. Implement Typing Indicator backend handlers
  - [ ] 10.1 Create `socket/handlers/typing.handler.js`
    - Handle `typing:start`: store `typing:{conversationId}:{userId}` in Redis with 3 s TTL;
      broadcast `typing:started { conversationId, userId, displayName }` to other participants
    - Handle `typing:stop`: delete key; broadcast `typing:stopped { conversationId, userId }`
    - Auto-expire: after 3 s of no `typing:start`, the TTL fires; a background listener broadcasts
      `typing:stopped` for that user
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  - [ ] 10.2 Register typing handlers on `/presence` namespace
    - _Requirements: 6.2_

- [ ] 11. Checkpoint — Channels/Presence phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests pass.
    Ask the user if any questions arise.

---

### Phase 4 — Delivery Status + Media/File Sharing + E2E Encryption

- [ ] 12. Implement delivery status tracking
  - [ ] 12.1 Extend `socket/handlers/dm.handler.js` for read receipts
    - Handle `status:read`: call `updateDeliveryStatus(messageId, 'read')`, emit `status:update
      { read }` to original sender (buffer and re-emit within 5 s of sender reconnect if offline)
    - Enforce idempotence: store a Redis set `read:{messageId}` — if `userId` already present,
      skip update; expire key after 7 days
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 7.8_
  - [ ]* 12.2 Write property test for delivery status lifecycle
    - **Property 16: Delivery status lifecycle**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.8**
    - File: `tests/unit/delivery.property.test.js`

- [ ] 13. Implement Media_Service
  - [ ] 13.1 Create `services/media.service.js` and `routes/media.js`
    - Configure `multer` with `diskStorage` (temp dir) and 50 MB `limits.fileSize`
    - MIME allowlist check using `file-type` (strip double-extension attacks); reject with
      `UNSUPPORTED_TYPE` or `FILE_TOO_LARGE`
    - Upload pipeline: temp → ClamAV scan (inline ≤10 MB, async >10 MB); on pass → move to
      S3/MinIO via `@aws-sdk/client-s3`, set `status: 'available'`, generate 1-hour signed URL;
      on scan fail → `status: 'quarantined'`, emit `media:quarantined` to uploader socket; if
      scanner unavailable → `status: 'scan_pending'`, enqueue retry in Redis list within 60 s
    - `POST /api/media/upload` response: `{ mediaId, signedUrl, name, size, mimeType, status }`
    - `GET /api/media/:mediaId/url` — generate fresh signed URL if expired (≤2 s)
    - Define `mediaFiles` Mongoose schema per design data model
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8, 8.9_
  - [ ]* 13.2 Write property test for media file validation
    - **Property 17: Media file validation**
    - **Validates: Requirements 8.1, 8.2**
    - File: `tests/unit/media.service.property.test.js`
  - [ ]* 13.3 Write property test for media upload response completeness
    - **Property 18: Media upload response completeness**
    - **Validates: Requirements 8.3**
    - File: `tests/unit/media.service.property.test.js`
  - [ ]* 13.4 Write property test for media accessibility gating
    - **Property 19: Media accessibility gating**
    - **Validates: Requirements 8.6, 8.8**
    - File: `tests/unit/media.service.property.test.js`

- [ ] 14. Implement Encryption_Service (backend key-store endpoint)
  - [ ] 14.1 Create `routes/encryption.js`
    - Define `encryptionKeys` Mongoose schema (`userId` unique, `publicKey` base64, timestamps)
    - `POST /api/encryption/keys` (authenticated) — upsert public key for requesting user; reject
      if key already exists for this device (idempotent on same device)
    - `GET /api/encryption/keys/:userId` (authenticated) — return stored public key; 404 if absent
    - `Message_Service` — enforce `isEncrypted === true` → `content = null`, `encryptedPayload`
      non-null; never log or store plaintext for encrypted messages
    - _Requirements: 9.1, 9.2, 9.7_
  - [ ]* 14.2 Write property test for E2E storage invariant
    - **Property 22: E2E storage invariant**
    - **Validates: Requirements 9.7**
    - File: `tests/unit/encryption.property.test.js`
  - [ ] 14.3 Mount encryption router in `server.js`
    - _Requirements: 9.2_

- [ ] 15. Checkpoint — Delivery/Media/Encryption phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests pass.
    Ask the user if any questions arise.

---

### Phase 5 — Message Search

- [ ] 16. Implement Search_Service
  - [ ] 16.1 Create `services/search.service.js` and `routes/search.js`
    - Ensure text index on `messages.content` with partial filter `{ isEncrypted: false }` is
      created on startup (already declared in Phase 2 schema setup — verify here)
    - `GET /api/search/messages` — query params: `q`, `sender`, `channelId`, `fromDate`, `toDate`,
      `hasAttachment`, `page`
    - Validate: reject `QUERY_INVALID` if `q.length < 2 || q.length > 200`; reject
      `INVALID_DATE_RANGE` if `fromDate > toDate`
    - Build compound filter (AND-logic): all provided filters are applied; results scoped to
      conversations the requesting user participates in; encrypted messages excluded
    - Extract highlight: server-side regex over matched terms, ≤100 chars of surrounding context
      per match
    - Return `{ results, total, page, highlight }`; empty list (no error) for zero results
    - Target response time ≤500 ms for up to 10M messages
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [ ]* 16.2 Write property test for search precision — plaintext only
    - **Property 23: Search precision — plaintext only**
    - **Validates: Requirements 10.6**
    - File: `tests/unit/search.service.property.test.js`
  - [ ]* 16.3 Write property test for search filter AND-logic
    - **Property 24: Search filter AND-logic**
    - **Validates: Requirements 10.2**
    - File: `tests/unit/search.service.property.test.js`
  - [ ]* 16.4 Write property test for search query validation
    - **Property 25: Search query validation**
    - **Validates: Requirements 10.5, 10.3**
    - File: `tests/unit/search.service.property.test.js`
  - [ ]* 16.5 Write property test for search highlight correctness
    - **Property 26: Search highlight correctness**
    - **Validates: Requirements 10.4**
    - File: `tests/unit/search.service.property.test.js`
  - [ ] 16.6 Mount search router in `server.js`
    - _Requirements: 10.1_

- [ ] 17. Checkpoint — Search phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests pass.
    Ask the user if any questions arise.

---

### Phase 6 — Voice/Video Calls (WebRTC Signaling)

- [ ] 18. Implement WebRTC_Service signaling relay
  - [ ] 18.1 Create `services/webrtc.service.js` and `socket/handlers/call.handler.js`
    - `call:invite`: validate `callType` ∈ `{'audio','video'}` and recipient is connected; reject
      `call:error` otherwise; check recipient not already in active call → emit `call:busy` to
      caller; store `call:{callId}` Redis hash (caller, recipient, state, SDP offer) with 60 s TTL;
      relay `call:incoming` to recipient
    - 30 s miss timer: if no `call:accept` within 30 s, emit `call:missed` to caller, clean up key
    - `call:accept`: relay SDP answer to caller; start 30 s ICE timeout via Redis EXPIRE refresh
    - `call:ice`: relay ICE candidate to peer; include configured STUN server addresses
    - TURN fallback: if ICE fails and TURN configured, attempt relay; if TURN also fails within
      10 s, emit `call:error { CALL_CONNECTION_FAILED }` to both peers, clean up
    - `call:end`: emit `call:ended` to other participant; delete `call:{callId}` key; stop relaying
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_
  - [ ] 18.2 Register `/call` namespace in `socket/index.js`; wire `call.handler.js`
    - _Requirements: 11.1_
  - [ ]* 18.3 Write property test for WebRTC call cleanup on end
    - **Property 27: WebRTC call cleanup on end**
    - **Validates: Requirements 11.4**
    - File: `tests/unit/webrtc.service.property.test.js`
  - [ ]* 18.4 Write property test for WebRTC busy guard
    - **Property 28: WebRTC busy guard**
    - **Validates: Requirements 11.8**
    - File: `tests/unit/webrtc.service.property.test.js`

- [ ] 19. Checkpoint — WebRTC phase
  - Run `npm test` in `main/backend`; ensure all property and unit tests pass.
    Ask the user if any questions arise.

---

### Cross-Cutting — Cosmic Canvas Frontend UI

- [ ] 20. Install frontend dependencies and configure Vitest
  - Add `socket.io-client`, `tweetnacl`, `simple-peer`, `framer-motion`, `recharts` to
    `main/frontend/package.json` (pinned versions)
  - Add `vitest`, `@vitest/ui`, `jsdom`, `fast-check` as dev dependencies (pinned versions)
  - Add `"test": "vitest --run"` script to `package.json`
  - Configure `vitest.config.js` (environment: jsdom, globals: true)
  - _Requirements: 12.1_

- [ ] 21. CSS Theme System and Glassmorphism foundation
  - [ ] 21.1 Create `src/styles/cosmic-theme.css`
    - Define all 13 CSS custom properties (`--color-canvas-bg-start`, `--color-canvas-bg-end`,
      `--color-surface-1`, `--color-surface-2`, `--color-accent-primary`, `--color-accent-secondary`,
      `--color-accent-tertiary`, `--color-text-primary`, `--color-text-secondary`, `--glass-blur`,
      `--glass-border`, `--glow-unread`, `--glow-active`) for each of the three Nebula themes:
      **Nebula Blue** (canvas `#0a0e1a`→`#1c1f2e`, accent primary `#00e5ff`, secondary `#7b2fff`,
      glow-unread `#00e5ff`), **Supernova** (canvas `#1a0a00`→`#2e1a00`, accent primary `#ffaa00`,
      secondary `#ff6600`, glow-unread `#ffcc44`), **Deep Violet** (canvas `#0d0a1a`→`#1a0d2e`,
      accent primary `#bf5fff`, secondary `#ff6ec7`, glow-unread `#cc88ff`)
    - Primary glow accent `#00e5ff`; secondary `#7b2fff`; tertiary `#ff6ec7` (Nebula Blue defaults)
    - Theme switching applies the full variable set atomically before the next paint via
      a `data-theme` attribute on `:root`; must complete within 500 ms of selection
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_
  - [ ] 21.2 Add Glassmorphism utility classes to `src/styles/cosmic-theme.css`
    - `.glass-panel`: `background: rgba(255,255,255,0.05)`, `backdrop-filter: blur(var(--glass-blur, 12px))`,
      `-webkit-backdrop-filter` prefixed variant, `border: 1px solid var(--glass-border)`,
      `border-radius: 16px`
    - `.glow-border-unread`: `box-shadow: 0 0 12px 3px var(--glow-unread)`
    - `.glow-border-active`: `box-shadow: 0 0 8px 2px var(--glow-active)`
    - Import `cosmic-theme.css` into `src/index.css` as the root stylesheet
    - _Requirements: 12.1, 12.3_
  - [ ]* 21.3 Write property test for theme completeness on switch
    - **Property 41: Theme completeness on switch**
    - **Validates: Requirements 21.5**
    - File: `src/tests/cosmicTheme.property.test.js`

- [ ] 22. CosmicCanvas and Zone_Gravity physics engine
  - [ ] 22.1 Create `src/components/canvas/CosmicCanvas.jsx`
    - Root canvas container with deep navy base gradient (`#0a0e1a`→`#1c1f2e`)
    - Implement `requestAnimationFrame` physics loop: each frame calls `stepGravity(state,
      activity, unreadCount, canvasCenter, deltaMs)` per node, updating `position`, `scale`,
      and `glowIntensity` per the design contract:
      (1) `targetScale` increases proportionally with `activity`; converges within 500 ms;
      (2) after 30 000 ms of `activity === 0`, `targetScale` returns to `1.0`, converges within
      2 000 ms; (3) active/unread nodes migrate toward `canvasCenter`; idle nodes drift to
      periphery; (4) `position` and `scale` spring-lerp toward targets each frame
    - Manage per-node `NodePhysicsState` in a `useRef` map; expose node positions via React
      context so child components can subscribe each frame
    - Route pointer events to child `OrbitalNode`s; cancel animation loop on unmount
    - _Requirements: 12.1, 12.2, 12.4_
  - [ ]* 22.2 Write property test for Zone_Gravity scaling responsiveness
    - **Property 38: Zone_Gravity scaling responsiveness**
    - **Validates: Requirements 12.2**
    - File: `src/tests/cosmicCanvas.property.test.js`
  - [ ]* 22.3 Write property test for CometInput position tracking
    - **Property 43: Comet_Input position tracking**
    - **Validates: Requirements 12.6**
    - File: `src/tests/cosmicCanvas.property.test.js`

- [ ] 23. OrbitalNode component
  - [ ] 23.1 Create `src/components/canvas/OrbitalNode.jsx`
    - Circular node containing a stacked avatar group (up to 3 overlapping avatars with
      placeholder initials); absolute-positioned on the canvas via `transform: translate(x, y)`
      driven by the `CosmicCanvas` physics context each frame
    - Apply `.glow-border-unread` (`#00e5ff` cyan) when `unreadCount > 0`; apply
      `.glow-border-active` (magenta/purple) when `activity > 0` and `unreadCount === 0`; no
      glow border when both are 0
    - `framer-motion` `motion.div` with `scale` animated spring to `targetScale`; badge overlay
      showing `unreadCount` when > 0
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ]* 23.2 Write property test for unread glow invariant
    - **Property 39: Unread glow invariant**
    - **Validates: Requirements 12.3**
    - File: `src/tests/orbitalNode.property.test.js`

- [ ] 24. GalaxyCluster component
  - [ ] 24.1 Create `src/components/canvas/GalaxyCluster.jsx`
    - Accept a `nodes` array and a `focalPoint` `{ x, y }` prop
    - Render each node as an `OrbitalNode` orbiting the focal point using a CSS/JS orbital
      motion offset (angle advances each animation frame); nodes maintain their `CosmicCanvas`
      physics state while also receiving the orbital offset
    - Render a cluster label (font-size ≥ 14px, positioned above the focal point) using the
      cluster's `name` prop
    - Visually distinguish each cluster from unaffiliated peripheral nodes (e.g., dashed orbit
      ring or shared tinted background)
    - _Requirements: 12.5_

- [ ] 25. ZonalNavigationBar and CometInput
  - [ ] 25.1 Create `src/components/canvas/ZonalNavigationBar.jsx`
    - Floating glass bar (`.glass-panel`) fixed at the top of the canvas viewport
    - Zone Search `<input>` that filters visible `OrbitalNode`s by name; debounced 300 ms
    - Filter tag buttons: **Active**, **Muted**, **Friends** — single-select; on tag selection,
      the canvas must update visible nodes within 300 ms to show only nodes matching the predicate
    - _Requirements: 12.8_
  - [ ] 25.2 Create `src/components/canvas/CometInput.jsx`
    - Semi-transparent floating `<textarea>` that docks below the selected `OrbitalNode`
    - Subscribes to the `CosmicCanvas` physics context; recalculates its `transform` every
      animation frame as `{ x: nodePosition.x, y: nodePosition.y + COMET_OFFSET_PX }` where
      `COMET_OFFSET_PX = 72`
    - `framer-motion` trailing light effect (`motion.div` trail elements) visible during movement
    - On submit: call `sendDm` or `sendChannelMessage` depending on selected zone type; clear input
    - _Requirements: 12.6_
  - [ ]* 25.3 Write property test for filter tag isolation
    - **Property 40: Filter tag isolation**
    - **Validates: Requirements 12.8**
    - File: `src/tests/zonalNavBar.property.test.js`

- [ ] 26. YappersHub — Main canvas view
  - [ ] 26.1 Create `src/components/canvas/YappersHub.jsx`
    - Root hub view; composes `CosmicCanvas` as the full-viewport base layer
    - Renders `GalaxyCluster`s in the central-to-mid region of the canvas; peripheral DM
      `OrbitalNode`s (without cluster affiliation) around the canvas edges
    - Renders `ZonalNavigationBar` as a fixed overlay at the top
    - Renders the `Sidebar` (minimalist translucent left panel, backdrop-blur ≥ 8px, icons for
      Search, New Zone, Settings, Profile avatar with status dot)
    - Node hover tooltip: appears after 300 ms hover delay, shows zone name + last activity,
      auto-dismisses after 150 ms of cursor leaving the node (use `framer-motion AnimatePresence`)
    - Node click → `CometInput` appears below node; double-click or "Expand" action → transitions
      to `ExpandedChatView` in 400 ms via `framer-motion` layout animation
    - _Requirements: 12.1, 12.2, 12.4, 12.7_
  - [ ]* 26.2 Write property test for Sidebar conversation item rendering
    - **Property 29: Sidebar conversation item rendering**
    - **Validates: Requirements 12.1**
    - File: `src/tests/yappersHub.property.test.js`
  - [ ]* 26.3 Write property test for active node click idempotence
    - **Property 30: Active conversation click idempotence**
    - **Validates: Requirements 12.3**
    - File: `src/tests/yappersHub.property.test.js`

- [ ] 27. ExpandedChatView
  - [ ] 27.1 Create `src/components/canvas/ExpandedChatView.jsx`
    - Large rounded glass container (`.glass-panel`, border-radius ≥ 20px) with blurred backdrop
      (backdrop-filter ≥ 12px) and glowing accent edge (`--glow-active` box-shadow)
    - Message list: sender bubbles — teal gradient, right-aligned; recipient bubbles — gray/purple
      gradient, left-aligned (same alignment rule as `MessageBubble` / Property 31)
    - Unread marker (horizontal divider labelled "New Messages") above first unread message;
      glowing "Jump to Latest" button (`.glow-border-active`) when scrolled above unread marker
    - Collapsible right context panel with 3 tabs:
      (a) **Zonal Shared Media** — thumbnail grid of `mediaAttachments` from conversation history
          (renders `<img>` for images, file icon for documents per Property 20)
      (b) **Pinned Messages** — scrollable list of pinned message excerpts
      (c) **Zone Members** — avatar + name list for channel members
      Panel collapse/expand animates in 200 ms via `framer-motion`
    - Show sender avatar alongside bubble for multi-person zones (channels)
    - Escape key or click outside container → trigger 400 ms close animation and return to
      `YappersHub` canvas view
    - Load conversation history via `getHistory`; emit `status:read` via IntersectionObserver
      (≥50% visible, idempotent per `messageId`)
    - _Requirements: 12.4, 12.5, 7.4, 7.9, 8.5_
  - [ ]* 27.2 Write property test for message bubble alignment
    - **Property 31: Message bubble alignment**
    - **Validates: Requirements 12.5**
    - File: `src/tests/expandedChatView.property.test.js`
  - [ ]* 27.3 Write property test for media rendering by MIME type
    - **Property 20: Media rendering by MIME type**
    - **Validates: Requirements 8.5**
    - File: `src/tests/expandedChatView.property.test.js`

- [ ] 28. CosmicExplorer — Zone Discovery overlay
  - [ ] 28.1 Create `src/components/canvas/CosmicExplorer.jsx`
    - Glass-scope full-viewport overlay: `.glass-panel` with backdrop-filter ≥ 12px blur
    - Discovery Clusters section: groups of related zones rendered as constellation groupings
      (nodes connected by faint SVG lines)
    - Discovery Cards: thumbnail, zone name, description (≤120 chars, truncate with ellipsis),
      active member count badge
    - **Join** action button: emits `channel:join` socket event; on success adds a new
      `OrbitalNode` to `CosmicCanvas` with a `framer-motion` scale-in animation completing within
      500 ms; closes explorer overlay
    - **Learn More** toggle: expands the card inline to show full description and member list
    - **Zone Full** indicator (replaces Join button) when channel `memberCount === 1000`
    - Close button / Escape: triggers 300 ms fade-out and restores the previous canvas view
    - _Requirements: 12.1, 4.3, 4.7_

- [ ] 29. ZoneIgnitionSystem — Creation Wizard
  - [ ] 29.1 Create `src/components/canvas/ZoneIgnitionSystem.jsx`
    - Three-panel overlay using `framer-motion` layout:
      (a) **Left panel** — form: Zone Name `<input>` (3–80 chars), Zone Type selector
          (DM / Channel), Scale slider, Range slider, Gravity slider
      (b) **Center panel** — `IgnitionOrb`: glowing sphere whose color, pulse frequency, and size
          update within 300 ms of any config change; implemented as a `motion.div` with
          radial-gradient background driven by form state
      (c) **Right panel** — contact invite toggles: list of contacts with iridescent cyan
          `<toggle>` switches
    - Step progress nodes at the bottom: 3 nodes (Configure → Invite → Launch); each node
      animates cyan→magenta (`#00e5ff` → `#ff6ec7`) in 400 ms via `framer-motion` when its step
      is completed; completed nodes never revert (monotonic progression)
    - Zone name inline validation: error message appears within 300 ms of invalid input
      (`CHANNEL_NAME_TAKEN`, length violation)
    - On **Launch**: call `POST /api/channels`, close overlay, add new `OrbitalNode` to canvas
      with scale-in animation completing within 600 ms
    - _Requirements: 4.1, 4.2, 12.1_
  - [ ]* 29.2 Write property test for step ignition monotonicity
    - **Property 42: Step ignition monotonicity**
    - **Validates: Requirements 18.5**
    - File: `src/tests/zoneIgnitionSystem.property.test.js`

- [ ] 30. ZoneObservationDeck — Analytics and Moderation
  - [ ] 30.1 Create `src/components/canvas/ZoneObservationDeck.jsx`
    - Role gate: if `currentUser.role` is neither `owner` nor `moderator` for the zone, display
      an error message and return to the canvas via a 300 ms transition
    - **Daily Chat Volume** line chart: 30-day data, rendered with `recharts` `<LineChart>`;
      line stroke color `#00e5ff` (cyan); X-axis dates, Y-axis message count
    - **User Growth Trends** bar chart: 12-week data, rendered with `recharts` `<BarChart>`;
      bar fill `#7b2fff` (purple)
    - **Moderation Queue**: vertically scrolling stream of flagged message cards; each card has
      **Approve**, **Remove**, and **Escalate** action buttons; actions resolve within 500 ms
      (optimistic update + backend call)
    - **Governance Toggles** panel: Slow Mode, Join Approval, Link Previews, File Uploads —
      iridescent cyan toggle switches; changes persist to backend within 1 s of toggle
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 31. WhisperStream — Direct Messages view
  - [ ] 31.1 Create `src/components/canvas/WhisperStream.jsx`
    - Left contact list panel: avatar, display name, last message timestamp, typing indicator
      dot; sorted by most recent activity; updates in real time via `presence:update` and
      `typing:started` / `typing:stopped` events
    - **Flowing ribbon light animation** between user avatar and selected contact avatar:
      `framer-motion` SVG path with animated stroke-dashoffset creating a moving light ribbon
    - DM transcript panel (right): follows the same bubble alignment, unread marker, and
      "Jump to Latest" rules as `ExpandedChatView`; `CometInput` docked at the transcript bottom
      (`COMET_OFFSET_PX = 72` below the input area)
    - Contact switch: ribbon + history transition completes within 400 ms (outgoing ribbon fades,
      incoming ribbon draws in via `framer-motion`; previous transcript unmounts, new one mounts)
    - Call initiation button: emits `call:invite` socket event → opens `CallOverlay` component
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 32. UserProfileSettings
  - [ ] 32.1 Create `src/components/canvas/UserProfileSettings.jsx`
    - Full-screen glassmorphism settings page (`.glass-panel`, full viewport, backdrop-filter
      ≥ 12px blur)
    - Large **cosmic-framed profile card** at top: avatar with iridescent animated border
      (CSS conic-gradient rotation), display name, status
    - Four-tab navigation using `framer-motion` `AnimatePresence` (200 ms tab-switch animation):
      (a) **Profile** — display name, bio, avatar upload (calls `PUT /api/users/profile`);
          save button persists to `Auth_Service` within 2 s; success confirmation indicator;
          error state with inline message
      (b) **Appearance & Themes** — three theme preview cards (Nebula Blue, Supernova, Deep Violet)
          with small canvas previews; clicking a card applies the theme to the full canvas within
          500 ms (swaps `data-theme` attribute on `:root`)
      (c) **Notifications** — Zone Alerts, Mentions, DMs toggle switches with iridescent cyan
          styling; persist preference to backend
      (d) **Security** — change password flow, connected devices list, active session management
    - Close / back button: 300 ms transition back to `YappersHub` canvas
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

- [ ] 33. Wire all Cosmic Canvas views into App router
  - [ ] 33.1 Add `/chat` protected route to `src/App.jsx`
    - Import and render `YappersHub` under a protected route (user must be authenticated)
    - Connect `useChatSocket`, `usePresence`, `useTyping` hooks; pass `chatJwt` obtained from
      `POST /api/chat/token` (called automatically on auth context ready)
    - _Requirements: 12.1, 12.2, 12.6_
  - [ ] 33.2 Add sub-path routes within the `/chat` root:
    - `/chat/explorer` → `CosmicExplorer` overlay
    - `/chat/new` → `ZoneIgnitionSystem` overlay
    - `/chat/dm` → `WhisperStream`
    - `/chat/zone/:id` → `ExpandedChatView`
    - `/chat/zone/:id/deck` → `ZoneObservationDeck`
    - `/chat/settings` → `UserProfileSettings`
    - All sub-path views render on top of the persistent `YappersHub` canvas (overlay pattern);
      navigating away triggers the appropriate closing animation before unmounting
    - _Requirements: 12.1_
  - [ ] 33.3 Add a **Chat** navigation entry to `DashboardPage.jsx` and `ProfileDropdown.jsx`
    - Link to `/chat`; display an unread badge when there are unread messages across all zones
    - _Requirements: 12.1_

- [ ] 34. Final checkpoint — Full integration
  - Run `npm test` in `main/backend` and `npm test` in `main/frontend`
  - Verify all 43 property tests pass (37 backend + 6 new Cosmic Canvas frontend properties:
    P38, P39, P40, P41, P42, P43)
  - Verify no ESLint errors in either workspace
  - Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Each task references specific requirements and design sections for traceability
- All 43 correctness properties from design.md are covered by property test sub-tasks
- Checkpoints after each phase ensure incremental validation before the next phase begins
- The `fast-check` library is used in both Node.js (backend Jest) and browser (frontend Vitest)
  environments; each property test includes the comment tag
  `// Feature: yappers-zone-chat, Property N: <property text>`
- Backend uses ES modules (`"type": "module"`) — Jest requires `--experimental-vm-modules` flag
- Property tests run minimum 100 iterations (configure via `fc.configureGlobal({ numRuns: 100 })`)
- `framer-motion` drives all canvas animations (node scale, panel transitions, orb reactions,
  ribbon light, step ignition, tab switches); `recharts` is used exclusively in `ZoneObservationDeck`
- `COMET_OFFSET_PX = 72` is the fixed vertical offset constant used by `CometInput` (Property 43)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "20"] },
    { "id": 1, "tasks": ["2.3", "2.4", "2.5", "2.6", "3.1", "21.1", "21.2"] },
    { "id": 2, "tasks": ["3.2", "5.1", "21.3"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "6.1", "22.1"] },
    { "id": 4, "tasks": ["6.2", "8.1", "9.1", "22.2", "22.3", "23.1"] },
    { "id": 5, "tasks": ["8.2", "8.4", "8.5", "8.6", "9.2", "9.4", "9.5", "9.6", "10.1", "23.2", "24.1"] },
    { "id": 6, "tasks": ["8.3", "9.3", "10.2", "12.1", "13.1", "24.2", "25.1", "25.2"] },
    { "id": 7, "tasks": ["12.2", "13.2", "13.3", "13.4", "25.3", "26.1"] },
    { "id": 8, "tasks": ["14.1", "16.1", "28.1", "28.2", "27.1", "26.2", "26.3"] },
    { "id": 9, "tasks": ["14.2", "14.3", "16.2", "28.3", "28.4", "27.2", "27.3"] },
    { "id": 10, "tasks": ["16.6", "28.5", "28.6", "28.7", "28.8", "18.1"] },
    { "id": 11, "tasks": ["16.3", "16.4", "16.5", "18.2", "18.3", "18.4", "29.1"] },
    { "id": 12, "tasks": ["29.2", "30.1", "31.1", "32.1"] },
    { "id": 13, "tasks": ["33.1", "33.2", "33.3"] }
  ]
}
```
