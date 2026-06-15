# Yappers Zone 🌌

Welcome to **Yappers Zone**, a full-stack real-time chat application featuring the **Cosmic Canvas** — a spatial, physics-driven dark UI where active conversations are visualized as floating orbital nodes. 

---

## 🚀 Tech Stack

- **Frontend**: React 19, Vite 7, React Router v7, Framer Motion, Firebase Client Auth, Socket.io-client, TweetNaCl (E2E DM Encryption).
- **Backend**: Node.js, Express 5, Socket.io, MongoDB (Mongoose), Redis (ioredis), Firebase Admin SDK (auth/verification), Nodemailer (SMTP).
- **Deployment**: Render Blueprint (`render.yaml`).

---

## ✨ Immersive Features

- 🌌 **Cosmic Canvas UI**: Conversations, users, and groups mapped as interactive, floatable orbital nodes.
- ✉️ **Email OTP Verification Gate**: Mandatory 6-digit email validation upon signup, with automated Redis/MongoDB fallback cache lifecycle.
- 🔒 **End-to-End Encrypted DMs**: Secure 1-on-1 private messaging using local-device TweetNaCl keypairs.
- 🕒 **Click Timings & Receipts**: Inspect exact Sent, Delivered, and Read receipt timestamps for every chat bubble.
- 📌 **Pinning System**: Collaborative pinning mechanism for messages in group channels and direct messages.
- ☽ **Live Status & Last Seen**: Real-time status mode sync (online, idle, dnd, offline) and exact database-backed last seen timestamps for offline users.

---

## 🛠️ Quick Setup (Local Development)

### 1. Prerequisites
- **Node.js** v18+ installed.
- A running **MongoDB** Atlas database.
- A **Firebase** project with Email/Password and Google sign-in methods active.
- A **Redis** server instance.

---

### 2. Backend Installation & Run
1. Navigate to the backend directory and install dependencies:
   ```bash
   cd main/backend
   npm install
   ```
2. Create your private configuration file:
   ```bash
   cp .env.example .env
   ```
   *Note: Populate all fields in `.env` (like `MONGODB_URI`, `JWT_SECRET`, and your Firebase service account parameters). Do not commit this file.*
3. Start the Express server:
   ```bash
   npm start
   ```
   *Backend API runs at `http://localhost:5000`.*

---

### 3. Frontend Setup
1. Navigate to the frontend directory and install dependencies:
   ```bash
   cd main/frontend
   npm install
   ```
2. Create your private client environment file:
   ```bash
   cp .env.example .env
   ```
   *Note: Set `VITE_API_BASE_URL=http://localhost:5000/api`.*
3. Launch the Vite local dev server:
   ```bash
   npm run dev
   ```
   *App runs at `http://localhost:5173`.*

---

## 🔐 Environment Variables Configuration

### Backend variables (`main/backend/.env`):
- `PORT`: Server port (default `5000`).
- `NODE_ENV`: Setup environment (`development` or `production`).
- `MONGODB_URI`: Complete MongoDB connection URL.
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`: Service account credentials from Firebase Console.
- `JWT_SECRET`, `CHAT_JWT_SECRET_CURRENT`: Custom secret keys for token generation.
- `REDIS_URL`: Redis database connection string.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP parameters required to send signup OTP emails (Gmail, Mailgun, etc.).

---

## 📂 Project Structure

```text
YAPPERS_ZONE/
├── main/
│   ├── backend/
│   │   ├── config/           # Firebase Admin & DB configuration
│   │   ├── models/           # Mongoose schemas (User, Otp)
│   │   ├── routes/           # REST endpoints (auth, channels, users, etc.)
│   │   ├── services/         # Core business logic (otp, presence, message)
│   │   ├── socket/           # WebSocket server and event handlers
│   │   └── server.js         # Server bootstrap
│   └── frontend/
│       ├── src/
│       │   ├── components/   # UI components (canvas, chat overlays, settings)
│       │   ├── hooks/        # custom hooks (useChatSocket, usePresence)
│       │   ├── services/     # encryption and API helpers
│       │   └── App.jsx       # App layout and routes
└── render.yaml               # Auto-deployment Render Blueprint
```

---

## 🚀 Production Deployment

### Blueprint Deployment on Render (Recommended)
This repository includes a `render.yaml` template file. To deploy backend services, frontend static hosting, and Redis all connected in one click:
1. Log in to your **Render Dashboard**.
2. Click **New** > **Blueprint**.
3. Connect this repository.
4. Fill in the required environment variables (e.g. `MONGODB_URI`, Firebase secrets, and SMTP mailer parameters) when prompted.
5. Click **Apply**.

---

## 📄 License
Licensed under the [ISC License](LICENSE).
