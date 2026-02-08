import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, apiCall } from './firebaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          // Register/login user in backend and get MongoDB profile
          const idToken = await firebaseUser.getIdToken();
          const response = await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ idToken }),
          });
          
          setUserProfile(response.user);
        } catch (error) {
          console.error('Failed to sync user with backend:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await apiCall('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData),
      });
      
      setUserProfile(response.user);
      return response.user;
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  const value = {
    user, // Firebase user
    userProfile, // MongoDB user profile
    loading,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}


