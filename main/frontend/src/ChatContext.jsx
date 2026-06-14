import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from './firebaseClient';
import { initKeys } from './services/encryption';

const ChatContext = createContext(null);

/**
 * ChatProvider — manages Chat JWT lifecycle and E2E key initialization.
 *
 * When the user is authenticated:
 *   1. Calls POST /api/chat/token to get a Chat JWT
 *   2. Initializes E2E encryption keys (initKeys)
 *   3. Uploads public key to backend if first time on this device
 *
 * The Chat JWT is passed down to useChatSocket which uses it for WebSocket auth.
 */
export function ChatProvider({ children }) {
  const { user, userProfile } = useAuth();
  const [chatJwt, setChatJwt] = useState(null);
  const [chatJwtLoading, setChatJwtLoading] = useState(false);
  const [encryptionKeys, setEncryptionKeys] = useState(null); // { publicKey, secretKey }

  const fetchChatJwt = useCallback(async () => {
    if (!user) return;
    setChatJwtLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/chat/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseIdToken: idToken }),
      });
      if (!res.ok) throw new Error('Failed to get chat token');
      const { chatJwt: token } = await res.json();
      setChatJwt(token);
    } catch (err) {
      console.error('[Chat] Failed to get Chat JWT:', err);
    } finally {
      setChatJwtLoading(false);
    }
  }, [user]);

  // Initialize Chat JWT when user logs in
  useEffect(() => {
    if (user && userProfile) {
      fetchChatJwt();
    } else {
      setChatJwt(null);
      setEncryptionKeys(null);
    }
  }, [user, userProfile]);

  // Initialize E2E keys after we have a Chat JWT
  useEffect(() => {
    if (!chatJwt || !userProfile) return;

    const userId = userProfile.id || userProfile._id;
    const keys = initKeys(userId);
    setEncryptionKeys(keys);

    // Upload public key to backend (POST /api/encryption/keys)
    // Upsert — safe to call multiple times
    fetch(`${API_BASE_URL}/encryption/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${chatJwt}`,
      },
      body: JSON.stringify({ publicKey: keys.publicKey }),
    }).catch((err) => console.warn('[E2E] Failed to upload public key:', err));
  }, [chatJwt, userProfile]);

  // Refresh Chat JWT 5 minutes before it expires (every 23 hours)
  useEffect(() => {
    if (!chatJwt) return;
    const REFRESH_INTERVAL = 23 * 60 * 60 * 1000; // 23 hours
    const timer = setTimeout(fetchChatJwt, REFRESH_INTERVAL);
    return () => clearTimeout(timer);
  }, [chatJwt, fetchChatJwt]);

  const value = {
    chatJwt,
    chatJwtLoading,
    encryptionKeys,
    refreshChatJwt: fetchChatJwt,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}
