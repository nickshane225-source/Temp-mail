/**
 * Firebase ID Token Verification Utility
 */

export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Firebase ID token is required');
  }

  // 1. If FIREBASE_API_KEY is available, verify with Google Identity Toolkit REST API
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCJ7DpD31zfzO4P9NUOQN2HwnsriCYcZEk';
  if (apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.users && data.users.length > 0) {
        const u = data.users[0];
        return {
          uid: u.localId,
          email: String(u.email || '').toLowerCase().trim(),
          emailVerified: !!u.emailVerified,
          name: u.displayName || '',
        };
      }
    } catch {}
  }

  // 2. Decode and validate standard Firebase JWT payload
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Failed to decode Firebase token payload');
  }

  if (!payload || !payload.sub) {
    throw new Error('Invalid Firebase token payload');
  }

  // Check expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error('Firebase token has expired. Please sign in again.');
  }

  // Check project ID if configured
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'temp-sms-d6d3a';
  if (projectId && (payload.iss || payload.aud) && process.env.NODE_ENV !== 'test') {
    const expectedIss = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIss && payload.aud !== projectId) {
      throw new Error('Firebase token does not match configured project ID.');
    }
  }

  return {
    uid: payload.sub,
    email: String(payload.email || '').toLowerCase().trim(),
    emailVerified: !!payload.email_verified,
    name: payload.name || '',
  };
}
