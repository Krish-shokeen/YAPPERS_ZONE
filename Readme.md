# Yappers Zone

A full-stack real-time chat application with the **Cosmic Canvas** UI — conversations visualized as floating orbital nodes on an immersive dark canvas.

## Tech Stack

**Frontend:** React 19, Vite 7, React Router v7, Firebase Client SDK, Socket.io-client, Framer Motion

**Backend:** Node.js, Express 5, Socket.io, MongoDB (Mongoose), Firebase Admin SDK, Redis (ioredis), JWT

## Features

- Firebase Authentication (Google & Email)
- Real-time 1-on-1 Direct Messaging via Socket.io
- Group Channels with presence and typing indicators
- Message delivery status (sent / delivered / read)
- Media and file sharing
- End-to-end encrypted DMs (TweetNaCl)
- Message search and smart filtering
- Voice and video calls (WebRTC)
- Cosmic Canvas UI — spatial, physics-driven conversation nodes
- System-aware dark mode with Nebula themes

## Prerequisites

- Node.js v18+
- MongoDB Atlas account
- Firebase project with authentication enabled
- Redis (local or hosted via Upstash)

## Setup

### Backend

```bash
cd main/backend
npm install
cp .env.example .env
# Fill in .env with your credentials
npm start
```

Server runs on `http://localhost:5000`

### Frontend

```bash
cd main/frontend
npm install
cp .env.example .env
# Set VITE_API_BASE_URL=http://localhost:5000/api
npm run dev
```

Frontend runs on `http://localhost:5173`

## Project Structure

```
YAPPERS_ZONE/
├── main/
│   ├── backend/
│   │   ├── config/           # Firebase Admin SDK init
│   │   ├── models/           # MongoDB User model
│   │   ├── routes/           # auth.js, chat-auth.js, channels.js, etc.
│   │   ├── services/         # message.service.js, presence.service.js, etc.
│   │   ├── socket/           # Socket.io server + event handlers
│   │   ├── chat-errors.js    # Typed error class
│   │   └── server.js         # Express + HTTP server + Socket.io bootstrap
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── chat/     # Legacy chat components
│       │   │   └── canvas/   # Cosmic Canvas UI components
│       │   ├── hooks/        # useChatSocket, usePresence, useTyping
│       │   ├── services/     # encryption.js (TweetNaCl)
│       │   ├── styles/       # cosmic-theme.css (Nebula themes)
│       │   └── App.jsx
│       └── vite.config.js
└── .kiro/specs/yappers-zone-chat/   # Spec: requirements, design, tasks
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register / login via Firebase |
| GET | `/api/auth/profile` | Get user profile |
| PUT | `/api/auth/profile` | Update user profile |
| POST | `/api/chat/token` | Exchange Firebase token for Chat JWT |
| POST | `/api/channels` | Create a channel |
| GET | `/api/channels` | List user's channels |
| POST | `/api/media/upload` | Upload a file |
| GET | `/api/media/:id/url` | Get a fresh signed URL |
| GET | `/api/search/messages` | Search messages |
| GET | `/api/health` | Health check |

## Socket.io Events

See `main/backend/socket/` for all event handlers. Key events:

- `dm:send` / `dm:receive` — direct messages
- `channel:join` / `channel:send` / `channel:message` — group channels
- `presence:update` — online/offline status
- `typing:start` / `typing:stop` — typing indicators
- `status:read` / `status:update` — delivery receipts
- `call:invite` / `call:accept` / `call:end` — WebRTC signaling

## Security

See `SECURITY.md` for credential management and best practices.

## License

ISC
