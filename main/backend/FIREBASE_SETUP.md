# Environment Variables Setup Guide

## Backend Environment Variables

All sensitive information is now stored in environment variables. Copy `.env.example` to `.env` and update the values:

```bash
cd main/backend
cp .env.example .env
```

### Required Environment Variables:

#### Server Configuration
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)
- `CORS_ORIGIN`: Frontend URL for CORS

#### MongoDB Configuration
- `MONGODB_URI`: Complete MongoDB connection string

#### Firebase Configuration
These values come from your `serviceAccountKey.json`:
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_PRIVATE_KEY_ID`: Private key ID from service account
- `FIREBASE_PRIVATE_KEY`: Private key (with \n escaped)
- `FIREBASE_CLIENT_EMAIL`: Service account email
- `FIREBASE_CLIENT_ID`: Client ID from service account

#### Frontend Firebase Configuration
These are for the client-side Firebase SDK:
- `FIREBASE_API_KEY`: Web API key
- `FIREBASE_AUTH_DOMAIN`: Auth domain
- `FIREBASE_STORAGE_BUCKET`: Storage bucket
- `FIREBASE_MESSAGING_SENDER_ID`: Messaging sender ID
- `FIREBASE_APP_ID`: App ID
- `FIREBASE_MEASUREMENT_ID`: Analytics measurement ID

#### JWT Configuration
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: Token expiration time

## Frontend Environment Variables

Copy `.env.example` to `.env` in the frontend folder:

```bash
cd main/frontend
cp .env.example .env
```

- `VITE_API_BASE_URL`: Backend API URL

## Security Notes

1. **Never commit `.env` files** - they're in `.gitignore`
2. **Use strong JWT secrets** in production
3. **Rotate keys regularly** in production
4. **Use different values** for development and production
5. **Service account key** (`serviceAccountKey.json`) is also in `.gitignore`

## Quick Setup

1. Place your `serviceAccountKey.json` in `main/backend/`
2. Copy values from the service account key to your `.env` file
3. Update MongoDB connection string
4. Generate a strong JWT secret
5. Start the server: `npm start`

The server will automatically use environment variables and provide secure configuration management.