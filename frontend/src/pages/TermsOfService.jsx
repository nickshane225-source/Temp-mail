import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer.jsx';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 transition-colors">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center text-white text-base font-bold shadow-md shadow-teal-600/20">
              ✉️
            </span>
            <span className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
              Temp<span className="text-teal-600">Mail</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/" className="hover:text-teal-600 transition-colors">
              Temporary Inbox
            </Link>
            <Link to="/blog" className="hover:text-teal-600 transition-colors">
              Blog
            </Link>
            <Link to="/privacy" className="hover:text-teal-600 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 md:p-12 shadow-sm space-y-8">
          <div>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 tracking-wider uppercase">
              Legal & Compliance
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mt-1">
              Terms of Service
            </h1>
            <p className="text-xs text-slate-400 mt-2">
              Last Updated: November 2026 • Effective Date: November 2026
            </p>
          </div>

          <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-300 space-y-6 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or using <strong>TempMail</strong> (<a href="https://tempmail.store" className="text-teal-600 underline">tempmail.store</a>), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                2. Nature of Service & Disposable Nature
              </h2>
              <p>
                TempMail provides free and premium temporary disposable email inboxes. These mailboxes are ephemeral and designed solely for short-term message receipt, spam protection, and privacy defense:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Mailboxes are temporary and expire automatically after a set duration (default: 30 minutes).
                </li>
                <li>
                  All emails, verification codes, and attachments are permanently purged and cannot be recovered after deletion or expiration.
                </li>
                <li>
                  <strong>Not for Critical Accounts:</strong> You must never use TempMail for sensitive, irreversible personal accounts such as primary banking, government services, healthcare records, or critical cryptocurrency wallets where permanent email recovery is required.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                3. Acceptable Use Policy
              </h2>
              <p>
                You agree to use TempMail only for lawful purposes. You must not use TempMail to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Engage in or facilitate any illegal activity, fraud, money laundering, or phishing schemes.</li>
                <li>Distribute malware, trojans, ransomware, or malicious payloads.</li>
                <li>Bypass rate limits, launch denial-of-service (DDoS) attacks, or disrupt our mail transmission relays.</li>
                <li>Send unsolicited bulk emails (SPAM) or harass any third parties.</li>
              </ul>
              <p>
                We reserve the right to immediately block IP addresses, domain relays, or accounts that violate this Acceptable Use Policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                4. Disclaimer of Warranties
              </h2>
              <p>
                The materials and services on TempMail are provided on an 'as is' and 'as available' basis. TempMail makes no warranties, expressed or implied, regarding message delivery reliability, uptime, or fitness for a particular purpose. Third-party mail servers may delay or reject incoming emails outside our operational control.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                5. Limitation of Liability
              </h2>
              <p>
                In no event shall TempMail or its operators be liable for any direct, indirect, incidental, special, or consequential damages (including, without limitation, loss of data, profit, or business interruption) arising out of the use or inability to use the temporary email service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                6. Contact Information
              </h2>
              <p>
                For legal inquiries or questions concerning our Terms of Service, please reach out to us at:
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                Email: <code className="text-teal-600 bg-teal-50 dark:bg-teal-950/40 px-2 py-1 rounded">support@tempmail.store</code>
              </p>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
