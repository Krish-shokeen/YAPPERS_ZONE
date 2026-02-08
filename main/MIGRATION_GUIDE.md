# Firebase to Backend Migration Guide

## What Changed

### 1. Firebase Configuration Moved to Backend
- Firebase Admin SDK is now initialized in the backend (`main/backend/config/firebase.js`)
- All Firebase credentials are stored in environment variables
- Frontend still uses Firebase Client SDK for authentication
- Service account key (`serviceAccountKey.json`) is used for backend authentication

### 2. Environment Variables Security
- **All sensitive data moved to `.env` files**
- MongoDB connection string in environment variables
- Firebase credentials from service account key in environment variables
- JWT secrets for additional token security
- CORS configuration for frontend communication

### 3. Dual User Storage
- Users are now stored in both Firebase and MongoDB
- Firebase handles authentication
- MongoDB stores additional user profile data and application-specific information

### 4. New Backend API Endpoints

#### Authentication Routes (`/api/auth/`)
- `POST /api/auth/register` - Register/login user (syncs Firebase user to MongoDB)
- `GET /api/auth/profile` - Get user profile from MongoDB
- `PUT /api/auth/profile` - Update user profile in MongoDB

#### Configuration Routes
- `GET /api/config/firebase` - Get Firebase client configuration
- `GET /api/health` - Server health check with environment info

### 5. Updated Frontend Integration
- `AuthContext` now handles both Firebase user and MongoDB profile
- API base URL configurable via environment variables
- Automatic user sync between Firebase and MongoDB on login

## Environment Variables

### Backend (.env)
```env
# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb+srv://...

# Firebase (from serviceAccountKey.json)
FIREBASE_PROJECT_ID=overyapper
FIREBASE_PRIVATE_KEY_ID=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=...
FIREBASE_CLIENT_ID=...

# Frontend Firebase Config
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_MEASUREMENT_ID=...

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Database Schema

### MongoDB User Model
```javascript
{
  firebaseUid: String (unique),
  email: String (unique),
  displayName: String,
  photoURL: String,
  provider: 'google' | 'email',
  createdAt: Date,
  lastLoginAt: Date,
  isActive: Boolean,
  timestamps: true
}
```

## Setup Instructions

### 1. Backend Setup
```bash
cd main/backend
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

### 2. Frontend Setup
```bash
cd main/frontend
cp .env.example .env
# Edit .env with your backend URL
npm install
npm run dev
```

### 3. Firebase Service Account
1. Download `serviceAccountKey.json` from Firebase Console
2. Place it in `main/backend/`
3. Copy values to `.env` file
4. File is automatically ignored by git

## Security Features

1. **Environment Variables**: All secrets in `.env` files
2. **Service Account**: Secure Firebase Admin SDK authentication
3. **JWT Tokens**: Additional security layer for API calls
4. **CORS Protection**: Configured for specific frontend origin
5. **Git Ignore**: Sensitive files excluded from version control

## Benefits of This Architecture

1. **Security**: No hardcoded credentials in source code
2. **Scalability**: Environment-specific configurations
3. **Maintainability**: Centralized configuration management
4. **Flexibility**: Easy deployment across different environments
5. **Compliance**: Follows security best practices

## Next Steps

1. Set up production environment variables
2. Configure CI/CD with environment secrets
3. Add monitoring and logging
4. Implement rate limiting and security headers