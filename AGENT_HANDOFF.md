# YAPPERS ZONE — Agent Handoff Document

## What This Project Is

A full-stack real-time chat application with a **Cosmic Canvas** UI — conversations are visualized
as floating orbital nodes on a 3D dark canvas governed by Zone Gravity physics. Built on
React 19 + Vite 7 (frontend) and Node.js + Express 5 + Socket.io + MongoDB + Redis (backend).

---

## Repository Structure

```
YAPPERS_ZONE/
├── main/
│   ├── backend/                    ← Express server
│   │   ├── config/firebase.js      ← Firebase Admin SDK init
│   │   ├── models/User.js          ← User schema (yapperHandle, friends, status)
│   │   ├── middleware/chatAuth.js  ← Chat JWT middleware for REST routes
│   │   ├── chat-errors.js          ← Typed ChatError class
│   │   ├── routes/
│   │   │   ├── auth.js             ← Firebase auth + profile (existing)
│   │   │   ├── chat-auth.js        ← POST /api/chat/token (Chat JWT issuance)
│   │   │   ├── channels.js         ← Channel CRUD
│   │   │   ├── users.js            ← User search, friend requests, status
│   │   │   ├── media.js            ← File upload pipeline
│   │   │   ├── search.js           ← Message full-text search
│   │   │   └── encryption.js       ← Public key store/fetch
│   │   ├── services/
│   │   │   ├── message.service.js  ← Messages/Channels/ChannelMembers schemas + CRUD
│   │   │   ├── presence.service.js ← Redis online/offline + typing TTL
│   │   │   ├── media.service.js    ← MediaFile schema, scan lifecycle
│   │   │   ├── search.service.js   ← MongoDB full-text search + filters
│   │   │   └── webrtc.service.js   ← Redis call session management
│   │   └── socket/
│   │       ├── index.js            ← Socket.io server + JWT auth middleware
│   │       └── handlers/
│   │           ├── dm.handler.js       ← dm:send/receive, offline flush, status:read
│   │           ├── channel.handler.js  ← channel:join/send/leave, auto-rejoin
│   │           ├── presence.handler.js ← presence:update, typing:start/stop
│   │           └── call.handler.js     ← WebRTC signaling relay
│   └── frontend/
│       └── src/
│           ├── App.jsx             ← Routes (/chat → ChatPage, /dashboard → redirect)
│           ├── AuthContext.jsx     ← Firebase auth state
│           ├── ChatContext.jsx     ← Chat JWT + E2E key lifecycle
│           ├── firebaseClient.js   ← Firebase init + API_BASE_URL
│           ├── hooks/
│           │   ├── useChatSocket.js ← Socket.io connection + event helpers
│           │   ├── usePresence.js   ← Real-time online/offline tracking
│           │   └── useTyping.js     ← Throttled typing:start/stop emission
│           ├── services/
│           │   └── encryption.js   ← TweetNaCl E2E encrypt/decrypt
│           ├── styles/
│           │   └── cosmic-theme.css ← 3 Nebula themes (CSS vars) + glassmorphism utils
│           └── components/
│               ├── LandingPage.jsx/.css  ← Full marketing page
│               ├── AuthLayout.jsx/.css   ← Shared auth wrapper (cursor, stars, card)
│               ├── LoginPage.jsx         ← Login with Google + email
│               ├── SignupPage.jsx         ← Signup with Google + email
│               ├── ForgotPasswordPage.jsx
│               └── canvas/
│                   ├── ChatPage.jsx          ← Root /chat route, cosmic background canvas
│                   ├── YappersHub.jsx         ← Main canvas with orbital nodes
│                   ├── Sidebar.jsx            ← Dark glassmorphism left panel (SVG icons)
│                   ├── OrbitalNode.jsx        ← Floating zone node with glow physics
│                   ├── ExpandedChatView.jsx   ← Full chat window (glass container)
│                   ├── MessageBubble.jsx      ← Message with delivery ticks, reactions
│                   ├── TypingIndicator.jsx    ← Animated typing dots
│                   ├── GlobalSearch.jsx       ← Dimmed overlay search (300ms debounce)
│                   ├── ProfileModal.jsx       ← Discord-style identity card popup
│                   └── SettingsPanel.jsx      ← 4-tab settings (Profile/Theme/Alerts/Security)
└── .kiro/specs/yappers-zone-chat/
    ├── requirements.md   ← 21 EARS-format requirements
    ├── design.md         ← Full technical design (43 correctness properties)
    └── tasks.md          ← 34 tasks across 6 backend phases + frontend
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, React Router v7, Framer Motion, Recharts |
| Auth | Firebase Client SDK v12 (frontend), Firebase Admin SDK v13 (backend) |
| Real-time | Socket.io v4 (server + client) |
| Database | MongoDB (Mongoose v9) |
| Presence/Cache | Redis (ioredis v5) |
| Encryption | TweetNaCl (X25519 + XSalsa20-Poly1305) |
| File uploads | Multer + file-type |
| HTTP | Express 5 |
| JWT | jsonwebtoken v9 (two keys: `JWT_SECRET` for app, `CHAT_JWT_SECRET_CURRENT` for Socket.io) |

---

## Auth Flow

1. User signs in via Firebase (Google or email)
2. `AuthContext` calls `POST /api/auth/register` → syncs user to MongoDB
3. `ChatContext` calls `POST /api/chat/token` with Firebase ID token → gets `chatJwt`
4. `useChatSocket` connects Socket.io using `{ auth: { token: chatJwt } }`
5. Socket.io middleware verifies `chatJwt` — invalid → `auth_error` + close 4001

---

## What Is BUILT ✅

### Backend
- [x] Chat JWT issuance with 5-min key rotation overlap
- [x] Socket.io server with JWT auth middleware
- [x] Message Service: insert, cursor-based pagination, delivery status update
- [x] DM socket handlers: dm:send/receive, offline flush, status:read/update
- [x] Channel CRUD REST + socket handlers: join/send/leave, 1000-member cap
- [x] Presence Service: Redis TTL, 3x retry, online/offline broadcast
- [x] Typing indicators: Redis 3s TTL, typing:start/stop events
- [x] WebRTC signaling relay: invite/accept/ice/end, 30s miss timer, busy guard
- [x] Message search: MongoDB text index, AND-filters, highlight extraction
- [x] Media upload: MIME allowlist, 50MB cap, scan_pending lifecycle (ClamAV stub)
- [x] E2E key store: `POST /api/encryption/keys`, `GET /api/encryption/keys/:userId`
- [x] User search: prefix match on handle/name, friend request system
- [x] User status: PATCH status text + mode (online/idle/dnd/offline)
- [x] Yapper ID: auto-generated `displayName#XXXX` handle on first save

### Frontend
- [x] Cosmic Canvas — 3D deep space background (animated stars + nebula orbs)
- [x] Landing page: disruptive hero, isometric 3D mockup, feature cards, live demo section
- [x] Auth pages (Login/Signup/ForgotPassword): Cosmic Canvas theme, glassmorphism card
- [x] Custom cursor: portal-rendered (z-index 2147483647), works on all pages
- [x] Sidebar: dark glassmorphism, SVG icons, cyan glow, 3D depth effect
- [x] OrbitalNode: floating zones with cyan/magenta glow, framer-motion scale physics
- [x] YappersHub: main canvas with Zone Gravity physics loop (rAF)
- [x] ExpandedChatView: glass container, message history, collapsible context panel
- [x] MessageBubble: sent/received alignment, delivery ticks, media rendering
- [x] TypingIndicator: animated dots, "Several people typing" threshold
- [x] GlobalSearch: 300ms debounce, instant dropdown, keyboard nav, Add button
- [x] ProfileModal: Discord-style card, copyable Yapper ID, status glow, Add/Message buttons
- [x] SettingsPanel: 4 tabs — Profile edit, Nebula theme switcher, Notification toggles, Security
- [x] ChatContext: Chat JWT auto-refresh, E2E key init + public key upload
- [x] useChatSocket, usePresence, useTyping hooks
- [x] encryption.js: TweetNaCl encrypt/decrypt with browser-native base64

---

## What Is NOT Built Yet ❌

### Backend
- [ ] Message reactions backend (addReaction/removeReaction in message.service.js)
- [ ] Thread replies (insertThreadReply, thread pagination)
- [ ] Channel governance settings (slow mode, join approval, link preview toggles)
- [ ] Zone Observation Deck data API (chat volume stats, moderation queue)
- [ ] Real ClamAV / SaaS malware scanner integration (currently auto-passes)
- [ ] S3/MinIO integration (media stored in local temp folder currently)
- [ ] Redis Trie / prefix cache for user search (currently uses MongoDB index)
- [ ] Friend request accept flow UI wiring (backend endpoint exists, no frontend UI)
- [ ] Pending friend requests notification

### Frontend
- [ ] ReactionPicker component (emoji grid, reaction toggle on MessageBubble)
- [ ] ThreadPanel component (slide-over thread replies)
- [ ] ZoneIgnitionSystem (Zone creation wizard — 3-panel with IgnitionOrb)
- [ ] CosmicExplorer (Zone discovery overlay)
- [ ] ZoneObservationDeck (analytics + moderation dashboard)
- [ ] WhisperStream (dedicated DM view with flowing ribbon animation)
- [ ] CallOverlay (WebRTC voice/video call UI using simple-peer)
- [ ] GalaxyCluster component (grouped nodes with shared orbital motion)
- [ ] ZonalNavigationBar (floating top bar with Active/Muted/Friends filter)
- [ ] CometInput (floating input that docks below and moves with selected node)
- [ ] Message infinite scroll history in ExpandedChatView (REST endpoint needed)
- [ ] Zonal Shared Media / Pinned Messages tab content (currently shows placeholder)
- [ ] UserProfileSettings full implementation (save to Firebase + backend wired)
- [ ] Friend requests inbox UI
- [ ] Notification system

---

## Environment Variables Required

### Backend (`main/backend/.env`)
```
PORT=5000
MONGODB_URI=...
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
JWT_SECRET=...
CHAT_JWT_SECRET_CURRENT=...
CHAT_JWT_SECRET_PREVIOUS=
CHAT_JWT_ROTATION_TS=0
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
```

### Frontend (`main/frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## Running Locally

```bash
# Backend
cd main/backend && npm install && npm start

# Frontend
cd main/frontend && npm install && npm run dev
```

Visit http://localhost:5173

---

## Key Design Decisions

1. **Two JWT types** — `JWT_SECRET` for the app session (7-day), `CHAT_JWT_SECRET_CURRENT` for Socket.io (24h). Keeping them separate means a leaked chat token can't access backend REST endpoints.

2. **Cursor-based pagination** — messages paginate by `createdAt` timestamp, not page numbers. New messages arriving mid-scroll don't cause page skips.

3. **Personal Socket.io rooms** — every user joins a room named after their MongoDB `_id` on connect. This lets any handler call `io.to(userId).emit(...)` without tracking socket IDs.

4. **Offline delivery flush** — on reconnect, `dm.handler.js` queries all messages with `deliveryStatus: 'sent'` addressed to this user and re-emits them in order.

5. **Yapper IDs** — generated by a `pre('save')` hook on the User model: `displayname#XXXX` where XXXX is a random 4-digit tag. Stored as `yapperHandle` with a unique index.

6. **E2E encryption** — private key stored in `localStorage` only, never leaves the device. Public key uploaded to backend. The message service enforces that encrypted messages have `content: null`.

7. **TweetNaCl** chosen over Web Crypto API — simpler API, same X25519 + XSalsa20-Poly1305 security, works in all browsers without async ceremony.
