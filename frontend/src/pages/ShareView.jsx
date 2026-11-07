import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { rewriteHtmlLinks } from '../utils/linkSafety';

const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data: cid: blob:; font-src https: data:"><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{font:15px/1.5 system-ui,sans-serif;margin:16px;color:#12241F;word-break:break-word}img{max-width:100%;height:auto;border-radius:6px}</style>`;

export default function ShareView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'This shared message has expired.');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const copyCode = async (code) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const printMessage = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="wrap" style={{ textAlign: 'center', padding: '60px 16px' }}>
        <p className="muted">Loading shared message…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="wrap" style={{ textAlign: 'center', padding: '60px 16px' }}>
        <h2>Message Expired</h2>
        <p className="muted">{error || 'This shared link has expired or was revoked.'}</p>
        <Link to="/" className="btn primary" style={{ marginTop: '16px', display: 'inline-flex' }}>
          ← Back to TempMail Home
        </Link>
      </div>
    );
  }

  const rawDoc = DOMPurify.sanitize(data.html || `<pre style="white-space:pre-wrap;font:inherit">${esc(data.text || '')}</pre>`);
  const doc = CSP + rewriteHtmlLinks(rawDoc);

  return (
    <div className="wrap" style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>
      <header className="top" style={{ marginBottom: '20px' }}>
        <div className="brand-group">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <b className="brand">TempMail</b>
          </Link>
          <span className="live-pill" style={{ background: '#E0E7FF', color: '#3730A3', borderColor: '#C7D2FE' }}>
            Shared Message
          </span>
        </div>
        <div className="top-actions">
          <button className="btn small" onClick={printMessage}>🖨️ Print</button>
          <Link to="/" className="btn primary small">Get Free Temp Inbox</Link>
        </div>
      </header>

      <div className="panel" style={{ padding: '24px', background: 'var(--paper)', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px' }}>{data.subject || '(no subject)'}</h1>
            <p className="muted" style={{ margin: 0 }}>From: <strong style={{ color: 'var(--ink)' }}>{data.from}</strong></p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <small className="muted" style={{ display: 'block' }}>
              Received: {new Date(data.receivedAt).toLocaleString()}
            </small>
            <small style={{ color: 'var(--stamp)', fontWeight: '600' }}>
              Link expires: {new Date(data.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        </div>

        {/* Verification Codes */}
        {data.codes && data.codes.length > 0 && (
          <div className="otp-card" style={{ marginTop: '16px' }}>
            <div className="otp-info">
              <span className="otp-tag">VERIFICATION CODE DETECTED</span>
              <div className="otp-display">
                {data.codes.map((code, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="otp-box">{code}</span>
                    <button
                      className={`btn otp-copy-btn ${copiedCode === code ? 'copied' : ''}`}
                      onClick={() => copyCode(code)}
                    >
                      {copiedCode === code ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Verification Links */}
        {data.links && data.links.length > 0 && (
          <div className="magic-links" style={{ marginTop: '16px' }}>
            {data.links.map((link, idx) => (
              <div key={idx} className="magic-link-card">
                <span>Verification Link:</span>
                <a
                  href={`/confirm-link?url=${encodeURIComponent(link.url)}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn primary magic-btn"
                >
                  {link.text || 'Verify / Open Link'} ↗
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Message sanitized view */}
        <div className="iframe-wrapper" style={{ marginTop: '20px' }}>
          <iframe
            title="Shared Message"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            srcDoc={doc}
            style={{ minHeight: '380px' }}
          />
        </div>
      </div>
    </div>
  );
}
