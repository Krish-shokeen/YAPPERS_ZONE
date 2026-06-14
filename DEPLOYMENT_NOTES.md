# Deployment Notes

## 🎯 What's Protected

### Files Excluded from Git (via .gitignore)

#### Backend
- ✅ `.env` - Contains all sensitive credentials
- ✅ `serviceAccountKey.json` - Firebase private key
- ✅ `accountkey.json` - Alternative key file name
- ✅ `node_modules/` - Dependencies
- ✅ `*.log` - Log files

#### Frontend
- ✅ `.env` - API configuration
- ✅ `node_modules/` - Dependencies
- ✅ `dist/` - Build output

### Files Included in Git

#### Configuration Templates
- ✅ `.env.example` - Template with placeholder values
- ✅ `.gitignore` - Git ignore rules
- ✅ `package.json` - Dependencies list

#### Documentation
- ✅ `README.md` - Setup instructions
- ✅ `SECURITY.md` - Security guidelines
- ✅ `MIGRATION_GUIDE.md` - Architecture documentation

## 🔐 Sensitive Information Removed

All sensitive data has been moved to environment variables:

### Backend Environment Variables (.env)
```
MONGODB_URI=mongodb+srv://[HIDDEN]
FIREBASE_PRIVATE_KEY=[HIDDEN]
FIREBASE_CLIENT_EMAIL=[HIDDEN]
JWT_SECRET=[HIDDEN]
```

### What's Safe to Expose

The following Firebase client configuration in the frontend is **safe and meant to be public**:
- `FIREBASE_API_KEY` - Public client API key
- `FIREBASE_AUTH_DOMAIN` - Public auth domain
- `FIREBASE_PROJECT_ID` - Public project identifier

These are protected by Firebase security rules, not by keeping them secret.

## 📋 Setup for New Developers

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd YAPPERS_ZONE
   ```

2. **Backend setup**
   ```bash
   cd main/backend
   npm install
   cp .env.example .env
   # Edit .env with actual credentials
   # Add serviceAccountKey.json file
   npm start
   ```

3. **Frontend setup**
   ```bash
   cd main/frontend
   npm install
   cp .env.example .env
   # Edit .env with backend URL
   npm run dev
   ```

## 🚀 Production Deployment

### Option A: One-Click Render Deployment via Blueprint (Recommended)
This repository includes a `render.yaml` blueprint that automatically configures and links the Backend API service, Frontend static site, and a Redis instance for presence tracking.

1. Go to the **Render Dashboard**.
2. Click **New** > **Blueprint**.
3. Select your repository.
4. Render will parse `render.yaml` and prompt you for the missing environment variables (such as `MONGODB_URI` and your Firebase keys).
5. Click **Apply** to deploy all services.

### Option B: Manual Environment Variables Setup

#### Backend (e.g., Heroku, Railway, Render)
Set these environment variables in your hosting platform:
- `MONGODB_URI`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NODE_ENV=production`

#### Frontend (e.g., Vercel, Netlify)
- `VITE_API_BASE_URL` - Your production backend URL

### Security Checklist for Production

- [ ] Use strong, unique JWT secret
- [ ] Enable HTTPS only
- [ ] Configure CORS for production domain
- [ ] Enable MongoDB IP whitelisting
- [ ] Set up monitoring and logging
- [ ] Enable rate limiting
- [ ] Configure security headers
- [ ] Regular security audits

## 🔄 Credential Rotation

Rotate these credentials regularly:
1. MongoDB password (every 90 days)
2. Firebase service account key (every 180 days)
3. JWT secret (every 90 days)

## 📞 Support

For setup issues:
1. Check `README.md` for installation steps
2. Review `SECURITY.md` for security guidelines
3. See `MIGRATION_GUIDE.md` for architecture details
4. Open an issue on GitHub

## ⚠️ Important Reminders

- **NEVER** commit `.env` files
- **NEVER** commit `serviceAccountKey.json`
- **ALWAYS** use `.env.example` as template
- **ALWAYS** verify `.gitignore` before pushing
- **ROTATE** credentials if compromised
