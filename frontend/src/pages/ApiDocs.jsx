import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function ApiDocs() {
  const { user } = useAuth();
  const [activeLang, setActiveLang] = useState('curl');
  const [copiedIndex, setCopiedIndex] = useState(null);

  const copyCode = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const curlExample = `curl -X POST https://yourdomain.com/api/v1/mailbox \\
  -H "X-Api-Key: tm_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "testbox"}'`;

  const jsExample = `const res = await fetch('https://yourdomain.com/api/v1/mailbox', {
  method: 'POST',
  headers: {
    'X-Api-Key': 'tm_your_api_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'testbox' }),
});
const mailbox = await res.json();
console.log('Created:', mailbox.address);`;

  const pyExample = `import requests

res = requests.post(
    'https://yourdomain.com/api/v1/mailbox',
    headers={'X-Api-Key': 'tm_your_api_key_here'},
    json={'name': 'testbox'}
)
mailbox = res.json()
print("Created:", mailbox['address'])`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            <span className="p-2 bg-emerald-100 dark:bg-emerald-950 rounded-xl">⚡</span>
            <span>TempMail Developer API v1</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/" className="hover:text-emerald-600 dark:hover:text-emerald-400">
              Inbox
            </Link>
            {user ? (
              <Link to="/account" className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-emerald-500">
                Account ({user.email?.split('@')[0]})
              </Link>
            ) : (
              <Link to="/login?next=/api/docs" className="hover:text-emerald-600 dark:hover:text-emerald-400">
                Sign in
              </Link>
            )}
            <Link to="/premium" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              Get API Key ⭐
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Intro */}
        <div className="mb-12">
          <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 rounded-full">
            REST API Reference
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight mt-4 mb-3">
            Programmatic Disposable Email API
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed max-w-3xl">
            Automate QA testing, sign-up verifications, and integration workflows with our high-speed Developer API. 
            All endpoints require an API Key available to active Premium subscribers.
          </p>
        </div>

        {/* Auth & Rate Limit Banner */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <h3 className="font-bold text-base flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
              <span>🔑</span> Authentication
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-normal">
              Pass your API key in the <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono">X-Api-Key</code> header or as a Bearer token in <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono">Authorization: Bearer tm_...</code>.
            </p>
          </div>
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <h3 className="font-bold text-base flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
              <span>⏱️</span> Rate Limits
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-normal">
              Each API key is provisioned with <strong>60 requests per minute</strong>. Headers include standard rate limit metadata.
            </p>
          </div>
        </div>

        {/* Quickstart Code Tabs */}
        <div className="mb-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex gap-2">
              {['curl', 'javascript', 'python'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    activeLang === lang
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'javascript' ? 'JavaScript (Node)' : lang}
                </button>
              ))}
            </div>
            <button
              onClick={() => copyCode(activeLang === 'curl' ? curlExample : activeLang === 'javascript' ? jsExample : pyExample, 'tab')}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              {copiedIndex === 'tab' ? '✓ Copied' : 'Copy snippet'}
            </button>
          </div>
          <pre className="p-6 text-sm font-mono overflow-x-auto text-slate-800 dark:text-slate-200 bg-slate-900 text-slate-100">
            <code>{activeLang === 'curl' ? curlExample : activeLang === 'javascript' ? jsExample : pyExample}</code>
          </pre>
        </div>

        {/* Endpoints Reference */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold tracking-tight">API Endpoints</h2>

          {/* Endpoint 1: List Domains */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                GET
              </span>
              <code className="text-base font-mono font-semibold">/api/v1/domains</code>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Returns all active receiving domains configured on the platform.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-xl text-xs font-mono">
              <pre>{`// Response 200 OK\n{\n  "domains": ["example.com", "tempmail.online"]\n}`}</pre>
            </div>
          </div>

          {/* Endpoint 2: Create Mailbox */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                POST
              </span>
              <code className="text-base font-mono font-semibold">/api/v1/mailbox</code>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Creates a new temporary mailbox. If <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">name</code> is provided, reserves a custom alias (3-30 chars). Premium inboxes remain active for 24 hours.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-xl text-xs font-mono space-y-2">
              <div className="text-slate-400">// Request Body (optional)</div>
              <pre>{`{\n  "name": "qa-test-user",\n  "domain": "tempmail.online"\n}`}</pre>
              <div className="text-slate-400 pt-2">// Response 200 OK</div>
              <pre>{`{\n  "address": "qa-test-user@tempmail.online",\n  "expiresAt": "2026-11-07T03:00:00.000Z",\n  "ttlSeconds": 86400,\n  "token": "4a71b... (24-byte hex)"\n}`}</pre>
            </div>
          </div>

          {/* Endpoint 3: List Messages */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                GET
              </span>
              <code className="text-base font-mono font-semibold">/api/v1/mailbox/:address/messages</code>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Returns all messages received by the given mailbox address, along with detected OTP codes and verification links.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-xl text-xs font-mono">
              <pre>{`// Response 200 OK
{
  "messages": [
    {
      "id": "6724a...",
      "from": "noreply@service.com",
      "subject": "Your verification code",
      "receivedAt": "2026-11-06T02:40:00.000Z",
      "codes": ["849201"],
      "links": [{ "url": "https://service.com/verify?token=xyz", "text": "Verify Account" }],
      "attachmentsCount": 0
    }
  ]
}`}</pre>
            </div>
          </div>

          {/* Endpoint 4: Get Single Message */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                GET
              </span>
              <code className="text-base font-mono font-semibold">/api/v1/mailbox/:address/messages/:id</code>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Retrieves the full message content, including raw sanitized HTML, plain text, extracted verification codes, and attachment metadata.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-xl text-xs font-mono">
              <pre>{`// Response 200 OK
{
  "id": "6724a...",
  "from": "auth@example.com",
  "subject": "Your Login Passcode",
  "text": "Your verification code is 492102",
  "html": "<div>...</div>",
  "codes": ["492102"],
  "links": [],
  "attachments": [],
  "receivedAt": "2026-11-06T02:40:00.000Z"
}`}</pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
