import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 transition-colors">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center text-white text-base font-bold shadow-md shadow-teal-600/20">
                ✉️
              </span>
              <span className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
                Temp<span className="text-teal-600">Mail</span>
              </span>
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Fast, secure, and disposable temporary email service. Protect your primary personal and business email from spam, surveillance, unsolicited marketing, and data broker breaches.
            </p>
            <div className="text-[11px] text-slate-400">
              Free disposable inboxes auto-expire in 30 minutes. No registration required.
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Navigation
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <li>
                <Link to="/" className="hover:text-teal-600 transition-colors">
                  Temporary Inbox
                </Link>
              </li>
              <li>
                <Link to="/blog" className="hover:text-teal-600 transition-colors">
                  Privacy & Security Blog
                </Link>
              </li>
              <li>
                <Link to="/premium" className="hover:text-teal-600 transition-colors">
                  Premium Ad-Free Plan
                </Link>
              </li>
              <li>
                <Link to="/api/docs" className="hover:text-teal-600 transition-colors">
                  Developer REST API
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Legal & Policies
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <li>
                <Link to="/privacy" className="hover:text-teal-600 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-teal-600 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy#cookies" className="hover:text-teal-600 transition-colors">
                  Cookie & Advertising Notice
                </Link>
              </li>
              <li>
                <a
                  href="https://www.google.com/settings/ads"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-teal-600 transition-colors"
                >
                  Google Ads Settings ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* AdSense Disclosure Banner */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="max-w-3xl text-center md:text-left">
            <strong>Advertising & Privacy Notice:</strong> We partner with Google AdSense to serve ads. Third-party vendors, including Google, use cookies to serve ads based on prior visits to this website. You can opt out of personalized ads via{' '}
            <a
              href="https://www.aboutads.info"
              target="_blank"
              rel="noreferrer"
              className="text-teal-600 hover:underline"
            >
              aboutads.info
            </a>{' '}
            or Google Ad Settings.
          </p>
          <div className="flex-none text-slate-400 text-xs">
            © {new Date().getFullYear()} TempMail. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
