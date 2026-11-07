import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Footer from '../components/Footer.jsx';

export default function Premium() {
  const { user, token, isPremium, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const checkoutSuccess = searchParams.get('success') === 'true';
  const orderId = searchParams.get('order');
  const intent = searchParams.get('intent');

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [pollingStatus, setPollingStatus] = useState('idle'); // 'idle' | 'polling' | 'confirmed' | 'timeout'
  const [pollCount, setPollCount] = useState(0);

  const checkoutButtonRef = useRef(null);

  // Auto-scroll or highlight if ?intent=upgrade
  useEffect(() => {
    if (intent === 'upgrade' && checkoutButtonRef.current) {
      checkoutButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [intent]);

  // Payment Status Polling when returning from crypto checkout
  useEffect(() => {
    if (!checkoutSuccess || !orderId || isPremium) {
      if (isPremium && checkoutSuccess) {
        setPollingStatus('confirmed');
      }
      return;
    }

    setPollingStatus('polling');
    let attempts = 0;
    const maxAttempts = 60; // 60 attempts * 3s = 3 minutes

    const interval = setInterval(async () => {
      attempts += 1;
      setPollCount(attempts);

      try {
        const authToken = token || localStorage.getItem('tm_user_token');
        if (!authToken) {
          clearInterval(interval);
          setPollingStatus('idle');
          return;
        }

        const res = await fetch(`/api/user/payment-status?order=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'finished' || data.status === 'confirmed' || data.isPremium) {
            clearInterval(interval);
            setPollingStatus('confirmed');
            await refreshUser();
            return;
          }
        }
      } catch (err) {
        console.warn('Polling status error:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setPollingStatus('timeout');
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [checkoutSuccess, orderId, isPremium, token, refreshUser]);

  const handleManualCheck = async () => {
    setPollingStatus('polling');
    setCheckoutError('');
    try {
      const authToken = token || localStorage.getItem('tm_user_token');
      const res = await fetch(`/api/user/payment-status?order=${encodeURIComponent(orderId || '')}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'finished' || data.status === 'confirmed' || data.isPremium) {
          setPollingStatus('confirmed');
          await refreshUser();
          return;
        }
      }
      setPollingStatus('timeout');
    } catch {
      setCheckoutError('Could not verify status. Please refresh in a moment.');
      setPollingStatus('timeout');
    }
  };

  const handlePayCrypto = async () => {
    setCheckoutError('');
    setCheckoutLoading(true);

    try {
      const authToken = token || localStorage.getItem('tm_user_token');
      if (!authToken) {
        navigate('/login?next=/premium&intent=upgrade');
        return;
      }

      const res = await fetch('/api/user/nowpayments/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize crypto checkout.');
      }

      const targetUrl = data.invoiceUrl || data.invoice_url;
      if (targetUrl) {
        window.location.href = targetUrl;
      } else {
        throw new Error('Invoice URL was not provided by gateway.');
      }
    } catch (err) {
      setCheckoutError(err.message || 'Payment initiation failed. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors pb-16">
      {/* Top Header */}
      <header className="border-b border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="TempMail logo" className="flex-none">
              <rect width="36" height="36" rx="10" fill="#0F766E"></rect>
              <path d="M9 13l9 6 9-6M9 13v10h18V13H9z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"></path>
            </svg>
            <span className="font-display font-bold text-2xl tracking-tight text-[#0F172A] dark:text-white">TempMail</span>
          </Link>

          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/" className="text-slate-600 dark:text-slate-300 hover:text-[#0F766E] transition-colors">
              Inbox
            </Link>
            <Link to="/api/docs" className="text-slate-600 dark:text-slate-300 hover:text-[#0F766E] transition-colors">
              API Docs
            </Link>
            {user ? (
              <Link
                to="/account"
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-teal-600"
              >
                Account ({user.email?.split('@')[0]})
              </Link>
            ) : (
              <Link
                to="/login?next=/premium"
                className="text-slate-600 dark:text-slate-300 hover:text-[#0F766E] transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Value Prop & Benefit Cards */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 mb-4 border border-teal-200 dark:border-teal-800/80">
                PREMIUM PRO
              </span>
              <h1 className="text-3xl sm:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight m-0">
                More time. No ads. Built for testing.
              </h1>
              <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                Supercharge your disposable workflow with 30-day extended retention, custom domain aliases, high-speed attachment streaming, and automated developer API integration.
              </p>
            </div>

            {/* 2x2 Benefits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-lg mb-3">
                  ⏱️
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                  30-Day Extended Inboxes
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Keep test addresses active for up to 30 full days without needing periodic manual resets or time extensions.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-lg mb-3">
                  🛡️
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                  100% Ad-Free Experience
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Zero banners, sponsored cards, or tracking pixels. A clean, distraction-free environment for power users.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-lg mb-3">
                  ✏️
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                  Unlimited Custom Aliases
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Choose specific prefixes like <code className="font-mono text-teal-600 dark:text-teal-400">staging-qa</code> or <code className="font-mono text-teal-600 dark:text-teal-400">billing</code> tailored to your accounts.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-lg mb-3">
                  ⚡
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                  Developer API Access
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Generate unlimited API keys with 60 req/min rate limit to automate inbox checks in Cypress, Playwright, or CI/CD.
                </p>
              </div>
            </div>

            {/* FAQ Accordion / Quick Bullets */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                Frequently Asked Questions
              </h3>
              <div className="space-y-4 text-xs sm:text-sm">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-200 m-0">
                    Can I pay with cryptocurrency?
                  </h4>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Yes. We accept Bitcoin (BTC), Ethereum (ETH), USDT, Solana (SOL), and 100+ cryptocurrencies seamlessly via NOWPayments.
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-200 m-0">
                    Does it auto-renew?
                  </h4>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    No. Subscriptions are strictly pay-as-you-go. You will never be auto-charged on a credit card without your explicit knowledge.
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-200 m-0">
                    Can I access my inboxes across multiple devices?
                  </h4>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Yes. When you sign in with your account, your active inboxes, preferences, and API keys sync across devices.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Teal Pricing Card (Matches Reference Image) */}
          <div className="lg:col-span-5 sticky top-24">
            <div
              ref={checkoutButtonRef}
              className="bg-[#0F766E] text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden transition-all border border-teal-600/40"
            >
              {/* Popular Pill */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-100">
                  PREMIUM PRO
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-teal-800/80 text-teal-100 border border-teal-500/40">
                  POPULAR
                </span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl sm:text-5xl font-display font-extrabold text-white">
                  $4.99
                </span>
                <span className="text-teal-100 font-medium text-base">/ month</span>
              </div>

              <p className="text-xs sm:text-sm text-teal-100 leading-relaxed mb-6">
                For developers, QA engineers, and power users who need high reliability.
              </p>

              {/* 5 Specific Checkmarks */}
              <ul className="space-y-3.5 text-xs sm:text-sm text-white mb-8 list-none p-0">
                <li className="flex items-center gap-3">
                  <span className="text-amber-300 text-base">★</span>
                  <span className="font-medium">30-Day Extended Inboxes</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-amber-300 text-base">★</span>
                  <span className="font-medium">100% Ad-Free Experience</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-amber-300 text-base">★</span>
                  <span className="font-medium">Developer API v1 (60 req/min)</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-amber-300 text-base">★</span>
                  <span className="font-medium">Custom Address Aliases</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-amber-300 text-base">★</span>
                  <span className="font-medium">Priority GridFS Attachment Downloads</span>
                </li>
              </ul>

              {/* Blockchain Confirmation Status Panel */}
              {pollingStatus === 'polling' && (
                <div className="mb-6 p-4 rounded-2xl bg-teal-800/90 border border-teal-400/50 text-white animate-pulse">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-none" />
                    <span className="font-bold text-xs uppercase tracking-wide">Confirming Payment</span>
                  </div>
                  <p className="text-xs text-teal-100 m-0">
                    This usually takes 1-2 minutes for blockchain confirmations. We're actively monitoring order{' '}
                    <span className="font-mono text-[11px] underline">{orderId?.slice(0, 16)}...</span>
                  </p>
                </div>
              )}

              {pollingStatus === 'confirmed' && (
                <div className="mb-6 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400 text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-bold">🎉</span>
                    <span className="font-bold text-sm">You're Premium!</span>
                  </div>
                  <p className="text-xs text-emerald-100 m-0">
                    Your subscription is active. Inboxes now last up to 30 days and API keys are unlocked.
                  </p>
                </div>
              )}

              {pollingStatus === 'timeout' && (
                <div className="mb-6 p-4 rounded-2xl bg-teal-900/90 border border-teal-500/50 text-white">
                  <p className="text-xs text-teal-100 mb-3">
                    Still confirming on the blockchain. You can safely close this page — your account will activate automatically once confirmed.
                  </p>
                  <button
                    type="button"
                    onClick={handleManualCheck}
                    className="w-full py-2 px-3 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs transition-colors"
                  >
                    Check again
                  </button>
                </div>
              )}

              {checkoutError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-900/60 border border-rose-400 text-xs text-rose-100">
                  {checkoutError}
                </div>
              )}

              {/* Action Button State */}
              <div>
                {!user ? (
                  <Link
                    to="/login?next=/premium&intent=upgrade"
                    className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#0F766E] font-bold text-sm sm:text-base transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <span>Sign in to upgrade</span>
                    <span>→</span>
                  </Link>
                ) : isPremium || pollingStatus === 'confirmed' ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled
                      className="w-full py-3.5 px-6 rounded-2xl bg-teal-800/90 text-teal-200 font-bold text-sm sm:text-base border border-teal-500/40 cursor-default flex items-center justify-center gap-2"
                    >
                      <span>✓ Active Premium Subscriber</span>
                    </button>
                    <div className="text-center">
                      <Link
                        to="/account"
                        className="text-xs text-teal-200 hover:text-white underline font-medium"
                      >
                        Manage account and API keys →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handlePayCrypto}
                    disabled={checkoutLoading || pollingStatus === 'polling'}
                    className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-teal-50 text-[#0F766E] font-bold text-sm sm:text-base transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
                        <span>Opening crypto gateway...</span>
                      </>
                    ) : (
                      <>
                        <span>Pay $4.99 with crypto</span>
                        <span>⚡</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="mt-4 text-center text-[11px] text-teal-200">
                🔒 Instant activation upon 1 blockchain confirmation. Zero KYC required.
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
