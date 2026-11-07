import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithGoogle,
  signInWithGoogleRedirect,
  checkRedirectResult,
  logOutFirebase,
} from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('tm_user_token') || '';
    } catch {
      return '';
    }
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync token to localStorage and fetch user profile
  const fetchUserProfile = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setLoading(false);
      try {
        localStorage.removeItem('tm_user_token');
        localStorage.removeItem('tm_user_premium');
      } catch {}
      return null;
    }

    try {
      const res = await fetch('/api/user/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        throw new Error('Session expired');
      }
      const data = await res.json();
      setUser(data);
      const activePrem = Boolean(data.isPremium);
      try {
        if (activePrem) {
          localStorage.setItem('tm_user_premium', 'true');
        } else {
          localStorage.removeItem('tm_user_premium');
        }
      } catch {}
      return data;
    } catch {
      try {
        localStorage.removeItem('tm_user_token');
        localStorage.removeItem('tm_user_premium');
      } catch {}
      setToken('');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: check Google redirect result first, then fetch user profile
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const redirectRes = await checkRedirectResult();
        if (redirectRes?.idToken && mounted) {
          const res = await fetch('/api/user/firebase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: redirectRes.idToken }),
          });
          const data = await res.json();
          if (res.ok && data.token) {
            localStorage.setItem('tm_user_token', data.token);
            setToken(data.token);
            await fetchUserProfile(data.token);
            return;
          }
        }
      } catch (err) {
        console.warn('Google redirect auth check notice:', err);
      }

      if (token && mounted) {
        await fetchUserProfile(token);
      } else if (mounted) {
        setLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, [token, fetchUserProfile]);

  const refreshUser = useCallback(async () => {
    const currentToken = token || localStorage.getItem('tm_user_token');
    if (!currentToken) return null;
    return await fetchUserProfile(currentToken);
  }, [token, fetchUserProfile]);

  const login = async (email, password) => {
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed. Please check your credentials.');
    }
    localStorage.setItem('tm_user_token', data.token);
    setToken(data.token);
    await fetchUserProfile(data.token);
    return data;
  };

  const register = async (email, password) => {
    const res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }
    localStorage.setItem('tm_user_token', data.token);
    setToken(data.token);
    await fetchUserProfile(data.token);
    return data;
  };

  const loginWithGooglePopup = async () => {
    const { idToken } = await signInWithGoogle();
    const res = await fetch('/api/user/firebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Google sign-in failed on server.');
    }
    localStorage.setItem('tm_user_token', data.token);
    setToken(data.token);
    await fetchUserProfile(data.token);
    return data;
  };

  const loginWithGoogleRedirectFlow = async () => {
    await signInWithGoogleRedirect();
  };

  const logout = () => {
    try {
      localStorage.removeItem('tm_user_token');
      localStorage.removeItem('tm_user_premium');
    } catch {}
    setToken('');
    setUser(null);
    logOutFirebase();
  };

  const isPremium = Boolean(
    user?.isPremium &&
      (!user.premiumUntil || new Date(user.premiumUntil).getTime() > Date.now())
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isPremium,
        login,
        register,
        loginWithGoogle: loginWithGooglePopup,
        loginWithGoogleRedirect: loginWithGoogleRedirectFlow,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
