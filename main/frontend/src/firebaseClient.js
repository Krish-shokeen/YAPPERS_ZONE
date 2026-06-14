import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

/**
 * Firebase client configuration.
 *
 * ⚠️  NEVER hardcode real API keys here.
 *     Set these values in main/frontend/.env (which is git-ignored):
 *
 *       VITE_FIREBASE_API_KEY=AIza...
 *       VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
 *       VITE_FIREBASE_PROJECT_ID=your-project-id
 *       VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
 *       VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
 *       VITE_FIREBASE_APP_ID=1:123456789:web:abc123
 *       VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX
 */
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// API base URL for backend
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
export const API_BASE_URL = rawBaseUrl.endsWith('/api')
  ? rawBaseUrl
  : (rawBaseUrl.endsWith('/') ? `${rawBaseUrl}api` : `${rawBaseUrl}/api`);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Helper function to get auth token
export const getAuthToken = async () => {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
};

// API helper functions
export const apiCall = async (endpoint, options = {}) => {
  const token = await getAuthToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
};
