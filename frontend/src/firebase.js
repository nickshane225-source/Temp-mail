import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCJ7DpD31zfzO4P9NUOQN2HwnsriCYcZEk',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'temp-sms-d6d3a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'temp-sms-d6d3a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'temp-sms-d6d3a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '944427755605',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:944427755605:web:e3e44d67735851ea544cdc',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
  firebaseConfig.projectId
);

let app = null;
let auth = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (err) {
    console.warn('Firebase initialization notice:', err.message);
  }
}

export { auth, googleProvider };

export async function signInWithGoogle() {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error('Firebase is not configured yet. Please add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in your Render / Environment Settings.');
  }
  const result = await signInWithPopup(auth, googleProvider);
  const idToken = await result.user.getIdToken();
  return { user: result.user, idToken };
}

export async function signInWithGoogleRedirect() {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error('Firebase is not configured yet.');
  }
  return signInWithRedirect(auth, googleProvider);
}

export async function checkRedirectResult() {
  if (!isFirebaseConfigured || !auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const idToken = await result.user.getIdToken();
      return { user: result.user, idToken };
    }
  } catch (err) {
    console.warn('Redirect auth check notice:', err.message);
    throw err;
  }
  return null;
}

export async function logOutFirebase() {
  if (auth) {
    try {
      await signOut(auth);
    } catch {}
  }
}
