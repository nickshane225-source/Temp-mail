import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { api } from '../api';
import { LANGUAGES, getInitialLang, applyLanguage, translate } from '../i18n';
import { rewriteHtmlLinks } from '../utils/linkSafety';
import { useAuth } from '../auth/AuthContext';

const KEY = 'tm_box';
const BOXES_KEY = 'tm_boxes';
const NOTIFY_KEY = 'tm_notify';
const THEME_KEY = 'tm_theme';
const READ_KEY = 'tm_read_ids';

const clock = (s) => {
  const safe = Math.max(0, Math.floor(s || 0));
  // 30-day count is completely removed; clamp any legacy multi-day value to 30 minutes (1800s)
  const effective = safe > 7200 ? 1800 : safe;
  if (effective >= 3600) {
    const h = Math.floor(effective / 3600);
    const m = Math.floor((effective % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(effective / 60);
  const sec = effective % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data: cid: blob:; font-src https: data:"><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{font:15px/1.5 system-ui,-apple-system,sans-serif;margin:16px;color:#1e293b;background:#ffffff;word-break:break-word}img{max-width:100%;height:auto;border-radius:6px}</style>`;

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

function triggerNotification(title, body) {
  if (localStorage.getItem(NOTIFY_KEY) !== 'true') return;
  playNotificationSound();
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {}
  }
}

// Client-side extraction fallback to ensure verification codes & links ALWAYS show up
function extractClientVerification(m) {
  if (!m) return { codes: [], links: [] };
  const codes = [...(m.codes || [])];
  const links = [...(m.links || [])];

  const html = m.html || '';
  const text = m.text || '';
  const subject = m.subject || '';

  // Decode quoted printable (e.g. =3D -> =, =\r\n -> "")
  const cleanHtml = (html || '')
    .replace(/=\r?\n/g, '')
    .replace(/=3D/gi, '=')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const plainText = `${subject}\n${text}\n${cleanHtml.replace(/<[^>]+>/g, ' ')}`;

  // If no codes yet, search for numeric and alphanumeric codes near keywords
  if (codes.length === 0) {
    const ignored = new Set(['HTTP', 'HTTPS', 'EMAIL', 'LOGIN', 'VERIFY', 'CHECK', 'CLICK', 'PLEASE', 'SECURITY', 'ACCESS', 'ACCOUNT', 'PASSWORD']);
    const codePatterns = [
      /(?:code|otp|pin|passcode|token|verification|login|security)\s*(?:is|:|-|=)?\s*[:\s#]*\b([A-Z0-9-]{4,10})\b/gi,
      /\b([0-9]{4,8})\b\s*(?:is\s+your\s+(?:verification|security|confirmation|login|otp|pin|code))/gi,
      /(?:enter|use|input|copy)\s+(?:the\s+)?(?:code\s+)?([A-Z0-9-]{4,10})\s+(?:to\s+(?:verify|confirm|login|sign in|authenticate)|as your)/gi,
      /(?:verification|confirmation|security|auth|one[- ]time|login)\s*(?:code|otp|pin|passcode)[^\d\n\r]{0,60}?\b([A-Z0-9-]{4,10})\b/gi,
      /\b([A-Z]-[0-9]{4,8})\b/gi,
    ];
    for (const pat of codePatterns) {
      let match;
      while ((match = pat.exec(plainText)) !== null) {
        const c = match[1]?.trim();
        if (c && !codes.includes(c) && /[0-9]/.test(c) && !ignored.has(c.toUpperCase())) {
          codes.push(c);
        }
      }
    }

    const dashedRegex = /(?:verification|security|login|confirmation|auth|one[- ]time)?\s*(?:code|otp|pin|passcode)[^\d\n\r]{0,40}?\b([0-9]{3})[- ]([0-9]{3,4})\b/gi;
    let dm;
    while ((dm = dashedRegex.exec(plainText)) !== null) {
      const combined = `${dm[1]}${dm[2]}`;
      if (!codes.includes(combined)) codes.push(combined);
    }

    const isolatedTagRegex = /<(?:strong|b|h[1-4]|td)[^>]*>\s*([0-9]{4,8})\s*<\/(?:strong|b|h[1-4]|td)>/gi;
    let isoMatch;
    while ((isoMatch = isolatedTagRegex.exec(cleanHtml)) !== null) {
      const code = isoMatch[1];
      if (code && !codes.includes(code)) {
        codes.push(code);
      }
    }

    const subjMatch = subject.match(/\b([0-9]{4,8})\b/);
    if (subjMatch && !codes.includes(subjMatch[1])) {
      codes.push(subjMatch[1]);
    }
  }

  // If no links yet, extract from <a> tags
  if (links.length === 0 && cleanHtml) {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
    const actionKeywords = [
      'verify', 'verification', 'confirm', 'confirmation', 'activate', 'activation',
      'login', 'log in', 'log-in', 'sign in', 'signin', 'sign-in',
      'magic', 'token', 'auth', 'authentication', 'callback', 'action', 'validate', 'validation',
      'get started', 'get-started', 'invitation', 'join', 'approve', 'access', 'continue', 'launch'
    ];
    let lm;
    while ((lm = linkRegex.exec(cleanHtml)) !== null) {
      let href = lm[1].trim().replace(/^3D/i, '').replace(/&amp;/g, '&');
      const rawText = lm[2].replace(/<[^>]*>/g, '').trim() || href;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        const isAction = actionKeywords.some((k) => rawText.toLowerCase().includes(k) || href.toLowerCase().includes(k));
        if (isAction && !links.some((l) => l.url === href)) {
          links.push({ url: href, text: rawText.replace(/\s+/g, ' ').slice(0, 60) });
        }
      }
    }
  }

  // Also check for raw URLs in plain text containing verify/token/auth keywords
  if (links.length === 0 && text) {
    const rawUrlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    let urlMatch;
    while ((urlMatch = rawUrlRegex.exec(text)) !== null) {
      const url = urlMatch[1].replace(/&amp;/g, '&');
      if (/verify|confirm|token|auth|sign-in|login|activate|magic/i.test(url)) {
        if (!links.some((l) => l.url === url)) {
          links.push({ url, text: 'Open Verification Link' });
        }
      }
    }
  }

  return { codes, links };
}

// Trusted Ad Renderer Component (Outside Iframe)
function AdContainer({ code, className = '' }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current || !code) return;
    containerRef.current.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = code;
    // Execute any script tags safely
    const scripts = wrapper.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
    containerRef.current.appendChild(wrapper);
  }, [code]);

  if (!code) return null;
  return (
    <div className={`overflow-hidden text-center my-3 p-2 bg-slate-100/50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl ${className}`}>
      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-1">Advertisement</div>
      <div ref={containerRef} />
    </div>
  );
}

export default function Home() {
  // Theme & Language
  const [lang, setLang] = useState(getInitialLang);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const t = (key) => translate(lang, key);

  // Core state
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState('');
  const [boxes, setBoxes] = useState([]);
  const [box, setBox] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && saved.address && saved.token && new Date(saved.expiresAt).getTime() > Date.now()) {
        const savedExp = new Date(saved.expiresAt).getTime();
        if (savedExp - Date.now() > 35 * 60 * 1000) {
          saved.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          saved.ttlSeconds = 1800;
          try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
        }
        return saved;
      }
    } catch {}
    return null;
  });
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const [error, setError] = useState('');
  const [notifyOn, setNotifyOn] = useState(() => localStorage.getItem(NOTIFY_KEY) === 'true');

  // Mobile navigation state ('inbox' or 'reader')
  const [mobileTab, setMobileTab] = useState('inbox');

  // Search & Read/Unread
  const [searchQuery, setSearchQuery] = useState('');
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch { return []; }
  });

  // Ads state
  const [ads, setAds] = useState({ adsEnabled: false, adHeader: '', adBelowCard: '', adSidebar: '' });

  // Modals state
  const [showQr, setShowQr] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareDuration, setShareDuration] = useState(1);
  const [shareData, setShareData] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [reportedId, setReportedId] = useState(null);
  const qrCanvasRef = useRef(null);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState(null);

  // Custom name state
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customStatus, setCustomStatus] = useState(null);
  const [checkingName, setCheckingName] = useState(false);

  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState('');
  const domainRef = useRef('');
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  const turnstileWidgetId = useRef(null);

  // Auth context integration
  const { user: authUser, isPremium: authIsPremium } = useAuth();
  const isUserPremium = Boolean(authIsPremium || (typeof window !== 'undefined' && localStorage.getItem('tm_user_premium') === 'true'));

  // Phase 1 Privacy & Inbox states
  const [inboxPassword, setInboxPassword] = useState('');
  const [isInboxLocked, setIsInboxLocked] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [previewPdfId, setPreviewPdfId] = useState(null);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Apply Language & Direction
  useEffect(() => {
    applyLanguage(lang);
  }, [lang]);

  // Load Ads Configuration & Manage Google AdSense (Guaranteed 100% Ad-Free for Premium Users)
  useEffect(() => {
    if (isUserPremium) {
      setAds({ adsEnabled: false, adHeader: '', adBelowCard: '', adSidebar: '' });
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.pauseAdRequests = 1;
      } catch {}
      // Remove any previously injected AdSense banners or iframes
      const injected = document.querySelectorAll('.adsbygoogle, ins.adsbygoogle, [id^="google_ads_iframe"]');
      injected.forEach((el) => {
        try { el.remove(); } catch {}
      });
      return;
    }

    // For Free users, fetch ads configuration and mount AdSense script
    api('/config/ads')
      .then((cfg) => {
        if (!cfg) return;
        setAds(cfg);
        if (cfg.adsEnabled) {
          const scriptId = 'google-adsense-script';
          if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1052993488526571';
            document.head.appendChild(script);
          }
        }
      })
      .catch(() => {});
  }, [isUserPremium]);

  // PWA Install prompt listener
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  // Turnstile Widget Loader
  useEffect(() => {
    if (!turnstileSiteKey) return;
    const renderTurnstile = () => {
      if (window.turnstile && document.getElementById('turnstile-container')) {
        try {
          if (turnstileWidgetId.current !== null) {
            window.turnstile.remove(turnstileWidgetId.current);
          }
          turnstileWidgetId.current = window.turnstile.render('#turnstile-container', {
            sitekey: turnstileSiteKey,
            callback: (token) => setTurnstileToken(token),
            'expired-callback': () => setTurnstileToken(''),
            'error-callback': () => setTurnstileToken(''),
            theme: theme === 'dark' ? 'dark' : 'light',
          });
        } catch {}
      }
    };

    if (window.turnstile) {
      renderTurnstile();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderTurnstile;
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey, theme]);

  // Load boxes from localStorage and purge expired
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOXES_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        const valid = list.filter((b) => b && b.address && b.token && new Date(b.expiresAt).getTime() > Date.now());
        // Clamp legacy 30-day mailboxes to 30 minutes
        const clampedList = valid.map((b) => {
          if (new Date(b.expiresAt).getTime() - Date.now() > 35 * 60 * 1000) {
            return { ...b, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), ttlSeconds: 1800 };
          }
          return b;
        });
        setBoxes(clampedList);
        localStorage.setItem(BOXES_KEY, JSON.stringify(clampedList));
      }
    } catch {}
  }, []);

  const saveBox = (b) => {
    localStorage.setItem(KEY, JSON.stringify(b));
    setBox(b);
    setBoxes((prev) => {
      const filtered = prev.filter((x) => x.address !== b.address);
      const updated = [b, ...filtered];
      localStorage.setItem(BOXES_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const removeBox = (address) => {
    setBoxes((prev) => {
      const updated = prev.filter((x) => x.address !== address);
      localStorage.setItem(BOXES_KEY, JSON.stringify(updated));
      if (box?.address === address) {
        const next = updated[0] || null;
        setBox(next);
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
      }
      return updated;
    });
  };

  // Initial load: domains & mailbox
  useEffect(() => {
    let unmounted = false;
    api('/domains')
      .then((d) => {
        if (unmounted) return;
        const norm = (Array.isArray(d) ? d : []).map((x) =>
          typeof x === 'string' ? { name: x } : (x?.name ? x : { name: String(x) })
        );
        setDomains(norm);
        const initialDomain = norm[0]?.name || '';
        if (initialDomain) {
          setDomain(initialDomain);
          domainRef.current = initialDomain;
        }

        try {
          const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
          if (saved && saved.address && saved.token && new Date(saved.expiresAt).getTime() > Date.now()) {
            const savedExp = new Date(saved.expiresAt).getTime();
            // If mailbox expiry was from the legacy 30-day setting, clamp it to 30 minutes
            if (savedExp - Date.now() > 35 * 60 * 1000) {
              saved.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
              saved.ttlSeconds = 1800;
              saveBox(saved);
            } else {
              setBox(saved);
            }
          } else {
            createMailbox(initialDomain);
          }
        } catch {
          createMailbox(initialDomain);
        }
      })
      .catch((e) => {
        setError(e.message);
        createMailbox('');
      });

    return () => { unmounted = true; };
  }, []);

  // Clock countdown timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const createMailbox = async (dom, customNameChoice) => {
    const targetDomain = dom || domain || domainRef.current || (domains[0]?.name) || '';
    setError('');

    if (customNameChoice && !isUserPremium) {
      setError('Custom email prefix is exclusive to Premium subscribers. Upgrade to Premium to choose custom addresses.');
      return;
    }

    const headers = {};
    if (turnstileToken) {
      headers['cf-turnstile-response'] = turnstileToken;
    }

    const payload = {};
    if (targetDomain) payload.domain = targetDomain;
    if (customNameChoice) {
      payload.name = customNameChoice;
    }

    try {
      const b = await api('/mailbox', {
        method: 'POST',
        headers,
        body: payload,
      });

      if (!b.token) {
        throw new Error('Server returned an inbox without a security token.');
      }

      saveBox(b);
      const returnedDomain = b.domain || (b.address && b.address.includes('@') ? b.address.split('@')[1] : targetDomain);
      if (returnedDomain) {
        setDomain(returnedDomain);
        domainRef.current = returnedDomain;
      }
      setMessages([]);
      setOpen(null);
      setMobileTab('inbox');
      setShowCustom(false);
      setCustomName('');
      setCustomStatus(null);
      setTurnstileToken('');
      if (window.turnstile && turnstileWidgetId.current !== null) {
        try { window.turnstile.reset(turnstileWidgetId.current); } catch {}
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Custom name live availability check
  useEffect(() => {
    if (!customName || customName.trim().length < 3) {
      setCustomStatus(null);
      return;
    }
    const clean = customName.toLowerCase().trim();
    if (!/^[a-z0-9._-]{3,30}$/.test(clean)) {
      setCustomStatus({ available: false, error: 'Use 3-30 letters, numbers, ., _, or -' });
      return;
    }

    setCheckingName(true);
    const targetDomain = domain || domainRef.current;
    const timer = setTimeout(() => {
      api(`/mailbox/check?name=${encodeURIComponent(clean)}&domain=${encodeURIComponent(targetDomain)}`)
        .then((res) => {
          setCustomStatus(res);
          setCheckingName(false);
        })
        .catch((err) => {
          setCustomStatus({ available: false, error: err.message });
          setCheckingName(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [customName, domain]);

  // Load message list with token
  const loadMessages = useCallback(
    async (b) => {
      if (!b || !b.address) return;
      if (!b.token) {
        createMailbox(domain);
        return;
      }
      try {
        const headers = {};
        if (inboxPassword) headers['x-inbox-password'] = inboxPassword;
        const res = await api(`/mailbox/${encodeURIComponent(b.address)}/messages`, {
          token: b.token,
          headers,
        });
        const list = Array.isArray(res) ? res : (Array.isArray(res?.messages) ? res.messages : []);
        if (res?.expiresAt) {
          const remoteExp = new Date(res.expiresAt).getTime();
          // Never accept a multi-day expiration; clamp any legacy values to 30 mins
          const effectiveExp = remoteExp - Date.now() > 35 * 60 * 1000
            ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
            : res.expiresAt;
          setBox((prev) => {
            if (!prev) return prev;
            if (prev.expiresAt === effectiveExp) return prev;
            return { ...prev, expiresAt: effectiveExp };
          });
        }
        if (res?.isLocked !== undefined) {
          setIsInboxLocked(Boolean(res.isLocked));
        }
        if (res?.hasPassword !== undefined) {
          setHasPassword(Boolean(res.hasPassword));
        }
        setMessages((prev) => {
          if (list.length > prev.length) {
            const newest = list[0];
            const title = newest.from || 'New email received';
            const body = newest.subject || 'Click to view your message';
            triggerNotification(title, body);
          }
          return list;
        });
      } catch (e) {
        if (e.status === 429) {
          // Rate limited: quietly pause and wait for next scheduled interval
          return;
        }
        if (e.status === 423) {
          setIsInboxLocked(true);
          setHasPassword(true);
          setMessages([]);
        } else if (e.status === 401) {
          removeBox(b.address);
          createMailbox(domain);
        } else if (e.status === 404) {
          createMailbox(domain);
        } else {
          setError(e.message);
        }
      }
    },
    [domain, inboxPassword]
  );

  const activeAddress = box?.address || '';
  const activeToken = box?.token || '';

  // SSE Stream connection with Polling fallback (depends on address and token, NOT mutable box object)
  useEffect(() => {
    if (!activeAddress || !activeToken) return;
    const targetBox = { address: activeAddress, token: activeToken };
    loadMessages(targetBox);

    let eventSource = null;
    let fallbackInterval = null;

    const setupSSE = () => {
      const url = `/api/mailbox/${encodeURIComponent(activeAddress)}/stream?token=${encodeURIComponent(activeToken)}`;
      eventSource = new EventSource(url);

      eventSource.addEventListener('initial', (e) => {
        try {
          const data = JSON.parse(e.data);
          const list = Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
          setMessages(list);
        } catch {}
      });

      eventSource.addEventListener('message', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          const newMsg = parsed.message || parsed;
          if (!newMsg || !newMsg._id) return;
          setMessages((prev) => {
            if (prev.some((m) => m._id === newMsg._id)) return prev;
            triggerNotification(newMsg.from || 'New Email', newMsg.subject || 'Security Verification Code Received');
            return [newMsg, ...prev];
          });
        } catch {}
      });

      eventSource.addEventListener('delete', (e) => {
        try {
          const { id } = JSON.parse(e.data);
          setMessages((prev) => prev.filter((m) => m._id !== id));
          setOpen((cur) => (cur && cur._id === id ? null : cur));
        } catch {}
      });

      eventSource.onerror = () => {
        if (eventSource) {
          try { eventSource.close(); } catch {}
          eventSource = null;
        }
        if (!fallbackInterval) {
          fallbackInterval = setInterval(() => loadMessages(targetBox), 6000);
        }
      };
    };

    setupSSE();
    // Dual-layer heartbeat: periodic background poll ensures messages arrive even if SSE stream drops or buffers
    const dualPollTimer = setInterval(() => loadMessages(targetBox), 12000);

    return () => {
      if (eventSource) {
        try { eventSource.close(); } catch {}
      }
      if (fallbackInterval) clearInterval(fallbackInterval);
      clearInterval(dualPollTimer);
    };
  }, [activeAddress, activeToken, loadMessages]);

  const rawLeft = box ? Math.max(0, Math.floor((new Date(box.expiresAt).getTime() - now) / 1000)) : 0;
  // 30 days time count removed: clamp any legacy multi-day value to 30 minutes (1800s)
  const left = rawLeft > 7200 ? 1800 : rawLeft;
  const maxDuration = Math.max(1800, box?.ttlSeconds || 1800, left);
  const progress = maxDuration > 0 ? Math.min(1, Math.max(0, left / maxDuration)) : 0;
  const dashoffset = 100 - progress * 100;

  const copy = () => {
    if (!box) return;
    navigator.clipboard.writeText(box.address);
    setCopied(true);
    toast.success(translate(lang, 'addressCopiedToast'));
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    playNotificationSound();
    toast.success(translate(lang, 'codeCopiedToast'));
    setTimeout(() => setCopiedCode(''), 2500);
  };

  const addTime = async () => {
    if (!box || !box.token) return;
    try {
      const b = await api(`/mailbox/${encodeURIComponent(box.address)}/extend`, {
        method: 'POST',
        token: box.token,
      });
      saveBox({ ...box, ...b, token: box.token });
      toast.success(translate(lang, 'timeAddedToast'));
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  };

  const del = async (id) => {
    if (!box || !box.token) return;
    try {
      await api(`/mailbox/${encodeURIComponent(box.address)}/messages/${id}`, {
        method: 'DELETE',
        token: box.token,
      });
      setMessages((m) => m.filter((x) => x._id !== id));
      if (open?._id === id) {
        setOpen(null);
        setMobileTab('inbox');
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleNotify = async () => {
    if (!notifyOn) {
      if ('Notification' in window) {
        if (Notification.permission === 'denied') {
          toast.warning(translate(lang, 'notifyDeniedToast'), {
            duration: 8000,
          });
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          localStorage.setItem(NOTIFY_KEY, 'true');
          setNotifyOn(true);
          playNotificationSound();
          toast.success(translate(lang, 'notifyEnabledToast'));
        } else {
          toast.warning(translate(lang, 'notifyDeniedToast'), {
            duration: 8000,
          });
        }
      } else {
        localStorage.setItem(NOTIFY_KEY, 'true');
        setNotifyOn(true);
      }
    } else {
      localStorage.setItem(NOTIFY_KEY, 'false');
      setNotifyOn(false);
      toast.info(translate(lang, 'notifyDisabledToast'));
    }
  };

  const selectMessage = async (m) => {
    setOpen(m);
    setMobileTab('reader');
    if (!readIds.includes(m._id)) {
      const updated = [m._id, ...readIds];
      setReadIds(updated);
      localStorage.setItem(READ_KEY, JSON.stringify(updated));
    }
    try {
      const full = await api(`/mailbox/${encodeURIComponent(box.address)}/messages/${m._id}`, {
        token: box.token,
        headers: inboxPassword ? { 'x-inbox-password': inboxPassword } : {},
      });
      if (full) {
        setOpen((prev) => (prev?._id === m._id ? { ...prev, ...full } : prev));
      }
    } catch {}
  };

  const handleExportZip = async () => {
    if (!box || !box.address) return;
    setExportingZip(true);
    try {
      const headers = { 'x-mailbox-token': box.token };
      if (inboxPassword) headers['x-inbox-password'] = inboxPassword;
      const res = await fetch(`/api/mailbox/${encodeURIComponent(box.address)}/export`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to export messages');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${box.address}-export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || translate(lang, 'exportFailed'));
    } finally {
      setExportingZip(false);
    }
  };

  const toggleReadStatus = (id) => {
    setReadIds((prev) => {
      const isRead = prev.includes(id);
      const next = isRead ? prev.filter((x) => x !== id) : [id, ...prev];
      localStorage.setItem(READ_KEY, JSON.stringify(next));
      return next;
    });
  };

  const downloadEml = () => {
    if (!open) return;
    const emlContent = `From: ${open.from || 'unknown'}\nTo: ${open.address || box?.address}\nSubject: ${open.subject || '(no subject)'}\nDate: ${new Date(open.receivedAt).toUTCString()}\nMIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n${open.html || open.text || ''}`;
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(open.subject || 'message').replace(/[^a-z0-9]/gi, '_')}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printMessage = () => {
    window.print();
  };

  // Generate QR Code
  useEffect(() => {
    if (showQr && qrCanvasRef.current && box?.address) {
      QRCode.toCanvas(qrCanvasRef.current, `mailto:${box.address}`, {
        width: 200,
        margin: 2,
        color: { dark: '#12241F', light: '#FFFFFF' },
      }).catch(() => {});
    }
  }, [showQr, box]);

  // Create Expiring Share Link
  const handleCreateShare = async () => {
    if (!open || !box?.token) return;
    try {
      const res = await api(`/mailbox/${encodeURIComponent(box.address)}/messages/${open._id}/share`, {
        token: box.token,
        method: 'POST',
        body: { durationHours: shareDuration },
      });
      setShareData(res);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeShare = async () => {
    if (!open || !shareData?.token) return;
    try {
      await api(`/mailbox/${encodeURIComponent(box.address)}/messages/${open._id}/share/${shareData.token}`, {
        token: box.token,
        method: 'DELETE',
      });
      setShareData(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReportMessage = async () => {
    if (!open || !box?.token) return;
    const reason = prompt('Please specify why you are reporting this message (e.g., spam, phishing, scam):', 'Spam / Phishing');
    if (!reason) return;
    try {
      await api(`/mailbox/${encodeURIComponent(box.address)}/messages/${open._id}/report`, {
        method: 'POST',
        token: box.token,
        body: { reason },
      });
      setReportedId(open._id);
      toast.success(translate(lang, 'reportSuccessToast'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Filter messages by search query
  const filteredMessages = messages.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.subject || '').toLowerCase().includes(q) ||
      (m.from || '').toLowerCase().includes(q) ||
      (m.text || '').toLowerCase().includes(q)
    );
  });

  // Extract verification details dynamically with client-side fallback
  const clientVerification = extractClientVerification(open);
  const detectedCodes = clientVerification.codes;
  const detectedLinks = clientVerification.links;
  const messageAttachments = open && Array.isArray(open.attachments) ? open.attachments : [];

  const rawDoc = open ? DOMPurify.sanitize(open.html || `<pre style="white-space:pre-wrap;font:inherit">${esc(open.text || '')}</pre>`) : '';
  const doc = open ? CSP + rewriteHtmlLinks(rawDoc) : '';

  const timeAgo = (date) => {
    if (!date) return 'just now';
    const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
    return `${Math.floor(diffSec / 86400)} d ago`;
  };

  return (
    <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100 font-sans transition-colors pb-16">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40 transition-colors">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-4 sm:py-4.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="TempMail logo" className="flex-none">
              <rect width="36" height="36" rx="10" fill="#0F766E"></rect>
              <path d="M9 13l9 6 9-6M9 13v10h18V13H9z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"></path>
            </svg>
            <span className="font-display font-bold text-[22px] tracking-tight text-[#0F172A] dark:text-white">TempMail</span>
            <span className="text-[12px] font-semibold text-[#0F766E] bg-[#CCFBF1] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F766E] animate-pulse"></span>
              Live
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm font-medium">
            <Link to="/blog" className="text-[#334155] dark:text-slate-300 hover:text-[#0F766E] font-medium transition-colors">
              Blog
            </Link>
            <Link to="/api/docs" className="text-[#334155] dark:text-slate-300 hover:text-[#0F766E] font-medium transition-colors">
              API Docs
            </Link>

            {/* Language Selector */}
            <select
              className="bg-transparent border border-[#CBD5E1] dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#334155] dark:text-slate-200 focus:outline-none"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label="Language"
            >
              {Object.entries(LANGUAGES).map(([code, meta]) => (
                <option key={code} value={code} className="bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-100">{meta.label}</option>
              ))}
            </select>

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-[#334155] dark:text-slate-200 transition-colors"
              title="Toggle Theme"
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Notification Bell */}
            <button
              onClick={toggleNotify}
              className={`p-1.5 rounded-lg border text-sm transition-all ${
                notifyOn
                  ? 'border-[#0F766E] bg-teal-50 dark:bg-teal-950/40 text-[#0F766E]'
                  : 'border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400'
              }`}
              title="Toggle Notifications"
              aria-label="Toggle Notifications"
            >
              🔔
            </button>

            {/* User Account / Sign in & Premium */}
            {authUser ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/account"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F172A] dark:text-slate-200 hover:border-[#0F766E] transition-colors"
                  title="Your Account"
                >
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="max-w-[110px] truncate">{authUser.email?.split('@')[0]}</span>
                </Link>
                <Link
                  to="/premium"
                  className="bg-[#0F766E] hover:bg-teal-800 text-white font-medium text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-[10px] transition-all shadow-xs"
                >
                  {isUserPremium ? '⭐ Pro Active' : 'Go Premium'}
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0F766E] px-2 py-1 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/premium"
                  className="bg-[#0F172A] hover:bg-slate-800 text-white font-medium text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-[10px] transition-all shadow-xs"
                >
                  Go Premium
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
        {/* Ad Placement 1: Header Banner (Outside Iframe) */}
        {ads.adsEnabled && !isUserPremium && ads.adHeader && (
          <AdContainer code={ads.adHeader} />
        )}

        {/* Multi-inbox Switcher */}
        {boxes.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="font-semibold text-slate-500 whitespace-nowrap">{t('switchInbox')}:</span>
            {boxes.map((b) => (
              <div
                key={b.address}
                onClick={() => { setBox(b); setOpen(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer transition-all border whitespace-nowrap ${
                  box?.address === b.address
                    ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-[#E2E8F0] dark:border-slate-800 hover:border-[#0F766E]'
                }`}
              >
                <span>{b.address}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeBox(b.address); }}
                  className="hover:opacity-75 font-bold ml-1"
                  aria-label={`Remove inbox ${b.address}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Turnstile Container */}
        {turnstileSiteKey && <div id="turnstile-container" className="flex justify-center mb-2" />}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs sm:text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="font-bold ml-4" aria-label="Dismiss error">×</button>
          </div>
        )}

        {/* Hero Address Section */}
        <section className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[20px] p-6 sm:p-8 flex flex-wrap gap-8 items-center justify-between shadow-sm">
          <div className="flex-1 min-w-[280px] sm:min-w-[480px] flex flex-col gap-4">
            <h1 className="m-0 font-display font-bold text-2xl sm:text-[34px] tracking-tight text-[#0F172A] dark:text-white">
              Your disposable address
            </h1>

            {/* Address Input & Copy Button */}
            <div className="flex flex-wrap gap-3">
              <input
                aria-label="Temporary email address"
                readOnly
                value={box ? box.address : 'Generating address...'}
                className="flex-1 min-w-[240px] min-h-[52px] box-border px-4 sm:px-5 text-base sm:text-[18px] font-sans border border-[#CBD5E1] dark:border-slate-700 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-100 font-mono font-medium select-all outline-none"
              />
              <button
                onClick={copy}
                className="min-h-[52px] px-6 sm:px-7 text-[16px] font-semibold font-sans text-white bg-[#0F766E] hover:bg-teal-800 active:bg-teal-900 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {copied ? '✓ Copied' : 'Copy address'}
              </button>
            </div>

            {/* Action Buttons Toolbar: NO Set PIN and NO Burn inbox! */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => createMailbox(domain)}
                className="min-h-[44px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 dark:hover:bg-slate-750 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
              >
                New address
              </button>
              <button
                onClick={addTime}
                className="min-h-[44px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 dark:hover:bg-slate-750 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
              >
                Add 30 minutes
              </button>
              <button
                onClick={() => setShowCustom(!showCustom)}
                className="min-h-[44px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 dark:hover:bg-slate-750 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>Custom name · Pro</span>
                {!isUserPremium && (
                  <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30">
                    PRO
                  </span>
                )}
              </button>
              <button
                onClick={handleExportZip}
                disabled={exportingZip || messages.length === 0}
                className="min-h-[44px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 dark:hover:bg-slate-750 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm disabled:opacity-40"
                title="Export all messages as a zip of .eml files"
              >
                {exportingZip ? 'Exporting...' : 'Export .eml'}
              </button>
              <button
                onClick={() => setShowQr(true)}
                className="min-h-[44px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 dark:hover:bg-slate-750 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
              >
                QR code
              </button>

              {domains.length > 1 && (
                <select
                  className="min-h-[44px] px-3 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] text-[#0F172A] dark:text-slate-200 focus:outline-none"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    domainRef.current = e.target.value;
                    createMailbox(e.target.value);
                  }}
                >
                  {domains.map((d) => (
                    <option key={d.name} value={d.name}>@{d.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Custom Alias Drawer */}
            {showCustom && (
              <div className="mt-2 p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#CBD5E1] dark:border-slate-700">
                {!isUserPremium ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-emerald-500/10 border border-amber-500/30">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
                        <span>👑</span>
                        <span>Premium Only Feature</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        Custom email prefixes are reserved exclusively for Premium members. Upgrade to choose your own address, get 30-day inbox lifespans, and 100% ad-free experience!
                      </p>
                    </div>
                    <Link
                      to="/premium"
                      className="whitespace-nowrap px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white font-bold text-xs shadow-sm"
                    >
                      Upgrade to Premium ⭐
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Choose your custom prefix:
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. myname"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono outline-none"
                      />
                      <button
                        onClick={() => createMailbox(domain, customName)}
                        disabled={!customStatus?.available}
                        className="px-4 py-2 rounded-xl bg-[#0F766E] text-white font-bold text-xs hover:bg-teal-800 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                    {checkingName && <p className="text-xs text-slate-400 mt-1">Checking availability...</p>}
                    {customStatus && (
                      <p className={`text-xs mt-1.5 font-semibold ${customStatus.available ? 'text-[#0F766E]' : 'text-red-500'}`}>
                        {customStatus.available ? '✓ Address is available!' : `✗ ${customStatus.error || 'Unavailable'}`}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Circular Countdown Progress Timer matching Main.dc.html */}
          <div className="relative w-[150px] h-[150px] flex-none mx-auto sm:mx-0">
            <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${clock(left)} remaining`}>
              <circle cx="75" cy="75" r="64" fill="none" stroke="#E2E8F0" strokeWidth="12" className="dark:stroke-slate-800"></circle>
              <circle
                cx="75"
                cy="75"
                r="64"
                fill="none"
                stroke="#0F766E"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="402"
                strokeDashoffset={Math.round(402 - (progress * 402))}
                transform="rotate(-90 75 75)"
                className="transition-all duration-1000 ease-linear"
              ></circle>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              <span className="font-display font-bold text-[24px] text-[#0F172A] dark:text-white leading-none">
                {clock(left)}
              </span>
              <span className="text-[12px] text-[#475569] dark:text-slate-400 mt-1">
                remaining
              </span>
            </div>
          </div>
        </section>

        {/* Ad Placement 2: Below Address Card (Outside Iframe) */}
        {ads.adsEnabled && !isUserPremium && ads.adBelowCard && (
          <AdContainer code={ads.adBelowCard} />
        )}

        {/* Mobile View Toggle Pills */}
        <div className="flex lg:hidden bg-slate-200 dark:bg-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => setMobileTab('inbox')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              mobileTab === 'inbox' ? 'bg-white dark:bg-slate-900 shadow-sm text-[#0F766E]' : 'text-slate-500'
            }`}
          >
            📥 Inbox ({messages.length})
          </button>
          <button
            onClick={() => setMobileTab('reader')}
            disabled={!open}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              mobileTab === 'reader' ? 'bg-white dark:bg-slate-900 shadow-sm text-[#0F766E]' : 'text-slate-500 disabled:opacity-40'
            }`}
          >
            ✉️ {open ? 'Message View' : 'No Message'}
          </button>
        </div>

        {/* Split Section: Inbox List (Left) + Message Reader (Right) */}
        <section className="flex flex-col lg:flex-row gap-6 items-stretch">
          {/* Left Column: Inbox List */}
          <div className={`w-full lg:w-[380px] xl:w-[420px] flex-none bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[20px] p-5 flex flex-col gap-2.5 shadow-sm ${mobileTab === 'reader' ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex justify-between items-center px-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <strong className="font-display font-bold text-xl text-[#0F172A] dark:text-white">Inbox</strong>
              <span className="text-[12px] font-semibold bg-[#CCFBF1] text-[#0F766E] px-2.5 py-1 rounded-full">
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {/* Search input */}
            {messages.length > 0 && (
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3.5 py-2 mb-1 text-xs font-sans rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-100 outline-none focus:border-[#0F766E]"
              />
            )}

            {/* Messages list container */}
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="text-3xl mb-2 animate-bounce">📬</div>
                  <p className="text-sm font-semibold text-[#0F172A] dark:text-slate-200">
                    {messages.length === 0 ? 'Waiting for incoming emails...' : 'No matching emails found'}
                  </p>
                  <p className="text-xs text-[#475569] dark:text-slate-400 mt-1 max-w-xs mx-auto">
                    {messages.length === 0 ? 'Your messages will appear here within seconds of being sent.' : 'Try adjusting your search terms.'}
                  </p>
                </div>
              ) : (
                filteredMessages.map((m) => {
                  const isUnread = !readIds.includes(m._id);
                  const isSelected = open?._id === m._id;
                  const previewExt = extractClientVerification(m);
                  const topCode = previewExt.codes[0];
                  const hasLink = previewExt.links.length > 0;
                  const timeAgoStr = timeAgo(m.receivedAt);

                  return (
                    <button
                      key={m._id}
                      onClick={() => selectMessage(m)}
                      className={`w-full text-left p-3.5 font-sans rounded-[14px] transition-all cursor-pointer ${
                        isSelected
                          ? 'border border-[#0F766E] bg-[#F0FDFA] dark:bg-teal-950/40 shadow-sm'
                          : 'border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#0F766E]'
                      }`}
                    >
                      <div className="font-semibold text-sm text-[#0F172A] dark:text-white truncate">
                        {m.from || 'Unknown sender'}
                      </div>
                      <div className="text-sm text-[#334155] dark:text-slate-300 mt-0.5 truncate">
                        {m.subject || '(no subject)'}
                      </div>
                      <div className="text-xs text-[#475569] dark:text-slate-400 mt-1.5 flex items-center justify-between">
                        <span>
                          {topCode
                            ? `Code detected · ${timeAgoStr}`
                            : hasLink
                            ? `Link detected · ${timeAgoStr}`
                            : timeAgoStr}
                        </span>
                        {m.attachments?.length > 0 && <span>📎 {m.attachments.length}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Ad Placement 3: Sidebar (Outside Iframe) */}
            {ads.adsEnabled && !isUserPremium && ads.adSidebar && (
              <div className="mt-2">
                <AdContainer code={ads.adSidebar} />
              </div>
            )}
          </div>

          {/* Right Column: Message Detail Reader */}
          <article className={`flex-1 min-w-0 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-[20px] p-6 sm:p-8 flex flex-col gap-5 shadow-sm ${mobileTab === 'inbox' ? 'hidden lg:flex' : 'flex'}`}>
            {open ? (
              <>
                {/* Mobile Back Button */}
                <button
                  onClick={() => setMobileTab('inbox')}
                  className="lg:hidden flex items-center gap-1.5 text-xs font-bold text-[#0F766E] mb-2 bg-[#CCFBF1] px-3 py-2 rounded-xl self-start"
                >
                  ← Back to Inbox ({messages.length})
                </button>

                {/* Sender & Subject Header */}
                <div>
                  <div className="text-[13px] text-[#475569] dark:text-slate-400">
                    From <strong className="font-semibold text-[#0F172A] dark:text-slate-200">{open.from}</strong> · {timeAgo(open.receivedAt)}
                  </div>
                  <h2 className="m-0 mt-1.5 font-display font-bold text-2xl sm:text-[26px] text-[#0F172A] dark:text-white leading-tight">
                    {open.subject || '(no subject)'}
                  </h2>
                </div>

                {/* Phishing Warning Banner */}
                {open.phishingWarning?.isSuspicious && (
                  <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border-2 border-red-500/60 text-red-900 dark:text-red-200 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⚠️</span>
                      <div className="flex-1">
                        <div className="font-extrabold text-sm uppercase tracking-wider text-red-700 dark:text-red-400">
                          Warning: Potential Phishing / Brand Impersonation
                        </div>
                        <p className="text-xs sm:text-sm mt-1 text-red-800 dark:text-red-300">
                          {open.phishingWarning.reason || 'This email claims to be from a well-known service, but the sender domain appears misleading or suspicious.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* OTP Verification Card */}
                {detectedCodes.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6 bg-[#F0FDFA] dark:bg-teal-950/40 border border-[#99F6E4] dark:border-teal-800 rounded-2xl shadow-sm">
                    <div>
                      <div className="text-[13px] font-semibold text-[#0F766E] dark:text-teal-400">
                        One-time code detected
                      </div>
                      <div className="font-display font-bold text-3xl sm:text-[44px] tracking-[8px] text-[#0F172A] dark:text-white my-1 select-all">
                        {detectedCodes[0]}
                      </div>
                    </div>
                    <button
                      onClick={() => copyCode(detectedCodes[0])}
                      className="min-h-[48px] px-6 font-sans text-[15px] font-semibold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      {copiedCode === detectedCodes[0] ? '✓ Copied' : 'Copy code'}
                    </button>
                  </div>
                )}

                {/* Verification Link Card */}
                {detectedLinks.length > 0 && detectedCodes.length === 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6 bg-[#F0FDFA] dark:bg-teal-950/40 border border-[#99F6E4] dark:border-teal-800 rounded-2xl shadow-sm">
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[13px] font-semibold text-[#0F766E] dark:text-teal-400">
                        One-click verification link detected
                      </div>
                      <div className="text-sm font-medium text-[#334155] dark:text-slate-300 mt-1 line-clamp-1">
                        {detectedLinks[0].text || detectedLinks[0].url}
                      </div>
                    </div>
                    <a
                      href={`/confirm-link?url=${encodeURIComponent(detectedLinks[0].url)}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="min-h-[44px] px-5 flex items-center font-sans text-sm font-semibold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl transition-all shadow-sm"
                    >
                      Open link safely ↗
                    </a>
                  </div>
                )}

                {/* Attachments Section with Inline Previews */}
                {messageAttachments.length > 0 && (
                  <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-700">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                      <span>📎 Attachments ({messageAttachments.length})</span>
                    </div>
                    <div className="space-y-3">
                      {messageAttachments.map((att, idx) => {
                        const fileUrl = `/api/mailbox/${encodeURIComponent(box.address)}/attachments/${att.fileId}?token=${encodeURIComponent(box.token)}`;
                        const isImage = (att.contentType && att.contentType.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename || '');
                        const isPdf = att.contentType === 'application/pdf' || /\.pdf$/i.test(att.filename || '');

                        return (
                          <div key={idx} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate max-w-[240px]">
                                <span className="font-semibold text-[#0F172A] dark:text-slate-200">{att.filename}</span>
                                <span className="text-slate-400 ml-2">({formatBytes(att.size)})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isPdf && !att.blocked && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewPdfId(previewPdfId === att.fileId ? null : att.fileId)}
                                    className="px-2.5 py-1 rounded-lg border border-[#CBD5E1] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[#334155] dark:text-slate-300"
                                  >
                                    {previewPdfId === att.fileId ? 'Hide PDF' : 'Preview PDF'}
                                  </button>
                                )}
                                {att.blocked ? (
                                  <span className="text-amber-600 font-bold">⚠️ {att.reason || 'Blocked'}</span>
                                ) : (
                                  <a
                                    href={fileUrl}
                                    download={att.filename}
                                    className="px-3 py-1 rounded-lg bg-[#0F766E] text-white font-bold hover:bg-teal-800"
                                  >
                                    Download
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Inline Image Preview */}
                            {isImage && !att.blocked && (
                              <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-2 flex justify-center">
                                <img
                                  src={fileUrl}
                                  alt={att.filename}
                                  className="max-h-64 object-contain rounded"
                                  loading="lazy"
                                />
                              </div>
                            )}

                            {/* Inline PDF Preview */}
                            {isPdf && previewPdfId === att.fileId && !att.blocked && (
                              <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                                <iframe
                                  src={fileUrl}
                                  title={`PDF Preview ${att.filename}`}
                                  className="w-full h-96 border-none"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Email Body Iframe */}
                <div className="rounded-2xl overflow-hidden border border-[#E2E8F0] dark:border-slate-800 bg-white">
                  <iframe
                    title="Message Body"
                    className="w-full min-h-[460px] border-none block"
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    srcDoc={doc}
                  />
                </div>

                {/* Bottom Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  {detectedLinks.length > 0 && (
                    <a
                      href={`/confirm-link?url=${encodeURIComponent(detectedLinks[0].url)}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="min-h-[42px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 text-[#0F172A] dark:text-slate-200 inline-flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      Open link safely ↗
                    </a>
                  )}
                  <button
                    onClick={downloadEml}
                    className="min-h-[42px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
                  >
                    Download .eml
                  </button>
                  <button
                    onClick={handleReportMessage}
                    className="min-h-[42px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
                  >
                    {reportedId === open._id ? 'Reported ✓' : 'Report sender'}
                  </button>
                  <button
                    onClick={() => { setShowShare(true); setShareData(null); }}
                    className="min-h-[42px] px-4 font-sans text-sm font-medium bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-[10px] hover:bg-slate-50 text-[#0F172A] dark:text-slate-200 transition-all shadow-sm"
                  >
                    Share
                  </button>
                  <button
                    onClick={() => del(open._id)}
                    className="min-h-[42px] px-4 font-sans text-sm font-medium text-red-600 bg-[#FEF2F2] dark:bg-red-950/40 border border-[#FECACA] dark:border-red-900 rounded-[10px] hover:bg-red-100 transition-all ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-24 text-slate-400 flex flex-col items-center justify-center">
                <div className="text-4xl mb-3">✉️</div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-slate-200 mb-1">
                  Select an email to view
                </h3>
                <p className="text-xs max-w-sm text-[#475569] dark:text-slate-400">
                  Detected OTP verification codes, one-click action links, and attachments will automatically be highlighted at the top.
                </p>
              </div>
            )}
          </article>
        </section>
      </main>

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">{t('qrModalTitle')}</h3>
            <p className="text-xs text-slate-500 mb-4">{t('qrModalSub')}</p>
            <div className="flex justify-center mb-4">
              <canvas ref={qrCanvasRef} className="rounded-2xl border p-2 bg-white" />
            </div>
            <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 break-all mb-4">
              {box?.address}
            </p>
            <button onClick={() => setShowQr(false)} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700">
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* Expiring Share Link Modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShare(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">{t('shareModalTitle')}</h3>
            <p className="text-xs text-slate-500 mb-4">{t('shareModalSub')}</p>

            {!shareData ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Link Expiration Lifetime
                  </label>
                  <select
                    value={shareDuration}
                    onChange={(e) => setShareDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none"
                  >
                    <option value={1}>1 hour</option>
                    <option value={4}>4 hours</option>
                    <option value={12}>12 hours</option>
                    <option value={24}>24 hours (maximum)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateShare} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700">
                    Create Link
                  </button>
                  <button onClick={() => setShowShare(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-400 mb-1">Shareable Public URL:</div>
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/share/${shareData.token}`}
                    className="w-full bg-transparent font-mono text-xs select-all outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/share/${shareData.token}`);
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700"
                  >
                    {shareCopied ? '✓ Copied' : 'Copy Link'}
                  </button>
                  <button onClick={handleRevokeShare} className="px-3 py-2.5 rounded-xl border border-red-300 text-red-600 text-xs font-bold hover:bg-red-50">
                    Revoke
                  </button>
                  <button onClick={() => setShowShare(false)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
