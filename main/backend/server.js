import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import chatAuthRouter from './routes/chat-auth.js';
import channelsRouter from './routes/channels.js';
import searchRouter from './routes/search.js';
import encryptionRouter from './routes/encryption.js';
import usersRouter from './routes/users.js';
import { initSocket } from './socket/index.js';
import { chatAuthMiddleware } from './middleware/chatAuth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatAuthRouter);

// Chat REST routes — protected by Chat JWT
app.use('/api/channels',   chatAuthMiddleware, channelsRouter);
app.use('/api/search',     chatAuthMiddleware, searchRouter);
app.use('/api/encryption', chatAuthMiddleware, encryptionRouter);
app.use('/api/users',      chatAuthMiddleware, usersRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Firebase config endpoint for frontend
app.get('/api/config/firebase', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Create HTTP server and attach Socket.io
// We use createServer(app) instead of app.listen() because Socket.io needs
// access to the raw HTTP server to handle WebSocket upgrade requests.
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

