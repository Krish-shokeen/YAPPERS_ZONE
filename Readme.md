# Yappers Zone

A full-stack web application with Firebase authentication and MongoDB storage.

## 🚀 Features

- Firebase Authentication (Google & Email)
- Dual storage system (Firebase + MongoDB)
- JWT token-based API security
- React frontend with Vite
- Express.js backend
- User profile management

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account
- Firebase project with authentication enabled
- npm or yarn

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd YAPPERS_ZONE
```

### 2. Backend Setup

```bash
cd main/backend
npm install
```

Create a `.env` file from the example:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
- MongoDB connection string
- Firebase service account credentials
- JWT secret key

Place your Firebase service account key file as `serviceAccountKey.json` in the backend folder.

### 3. Frontend Setup

```bash
cd main/frontend
npm install
```

Create a `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and set your backend API URL (default: `http://localhost:5000/api`).

## 🔐 Environment Variables

### Backend (.env)

See `main/backend/.env.example` for all required variables:
- `MONGODB_URI` - Your MongoDB connection string
- `FIREBASE_*` - Firebase service account credentials
- `JWT_SECRET` - Secret key for JWT tokens
- `CORS_ORIGIN` - Frontend URL for CORS

### Frontend (.env)

- `VITE_API_BASE_URL` - Backend API URL

## 🚦 Running the Application

### Start Backend Server

```bash
cd main/backend
npm start
```

Server will run on `http://localhost:5000`

### Start Frontend Development Server

```bash
cd main/frontend
npm run dev
```

Frontend will run on `http://localhost:5173`

## 📁 Project Structure

```
YAPPERS_ZONE/
├── main/
│   ├── backend/
│   │   ├── config/          # Configuration files
│   │   ├── models/          # MongoDB models
│   │   ├── routes/          # API routes
│   │   ├── server.js        # Express server
│   │   └── .env.example     # Environment template
│   └── frontend/
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── AuthContext.jsx
│       │   └── firebaseClient.js
│       └── .env.example     # Environment template
└── README.md
```

## 🔒 Security Notes

- Never commit `.env` files
- Never commit `serviceAccountKey.json`
- Keep your JWT secret secure
- Use strong passwords for MongoDB
- Rotate credentials regularly

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register/login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Configuration
- `GET /api/config/firebase` - Get Firebase client config
- `GET /api/health` - Health check

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For issues and questions, please open an issue in the GitHub repository.
