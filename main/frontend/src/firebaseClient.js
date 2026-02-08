import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Default configuration (fallback)
const defaultFirebaseConfig = {
  apiKey: 'AIzaSyDowsScoo5jfv-M0JI5iXopzrGrxEUAY4A',
  authDomain: 'overyapper.firebaseapp.com',
  projectId: 'overyapper',
  storageBucket: 'overyapper.firebasestorage.app',
  messagingSenderId: '1035249795606',
  appId: '1:1035249795606:web:09c1c534de69c77df4ab37',
  measurementId: 'G-MK7723RW8W',
};

// API base URL for backend
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Initialize Firebase with default config
const app = initializeApp(defaultFirebaseConfig);
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

// Function to load Firebase config from backend (optional)
export const loadFirebaseConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config/firebase`);
    if (response.ok) {
      const config = await response.json();
      console.log('Firebase config loaded from backend');
      return config;
    }
  } catch (error) {
    console.warn('Failed to load Firebase config from backend, using default:', error);
  }
  return defaultFirebaseConfig;
};


