import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer.jsx';

export default function PrivacyPolicy() {
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
            <Link to="/premium" className="px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">
              Go Premium
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
              Privacy Policy
            </h1>
            <p className="text-xs text-slate-400 mt-2">
              Last Updated: November 2026 • Effective Date: November 2026
            </p>
          </div>

          <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-300 space-y-6 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                1. Overview & Commitment to Privacy
              </h2>
              <p>
                At <strong>TempMail</strong> (accessible at <a href="https://tempmail.store" className="text-teal-600 underline">tempmail.store</a>), one of our main priorities is the privacy of our visitors. This Privacy Policy document outlines the types of information collected and recorded by TempMail and how we use and protect it.
              </p>
              <p>
                TempMail provides free disposable email addresses designed to shield your personal identity from spam, data brokers, tracking, and unsolicited communications. Free mailboxes require <strong>no registration, no name, and no personal email address</strong> to create or use.
              </p>
            </section>

            <section id="cookies" className="space-y-3 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                2. Google AdSense & Third-Party Advertising (Cookie Policy)
              </h2>
              <p>
                We use <strong>Google AdSense</strong> to display advertisements to support our free temporary mailbox infrastructure. Google, as a third-party vendor, uses cookies and web beacons to serve ads on our site:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Third-Party Vendor Cookies:</strong> Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to our website or other websites on the Internet.
                </li>
                <li>
                  <strong>Advertising Cookies:</strong> Google’s use of advertising cookies enables it and its partners to serve ads to our users based on their visits to our site and/or other sites across the web.
                </li>
                <li>
                  <strong>Opting Out of Personalized Advertising:</strong> Users may opt out of personalized advertising by visiting Google's official <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer" className="text-teal-600 underline font-semibold">Google Ads Settings</a>.
                </li>
                <li>
                  Alternatively, you can opt out of a third-party vendor's use of cookies for personalized advertising by visiting <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer" className="text-teal-600 underline font-semibold">www.aboutads.info</a> or the <a href="https://youronlinechoices.com" target="_blank" rel="noreferrer" className="text-teal-600 underline font-semibold">Your Online Choices</a> portal.
                </li>
                <li>
                  <strong>100% Ad-Free for Premium Users:</strong> If you are subscribed to a TempMail Premium plan, advertising scripts (including Google AdSense) are completely disabled and no advertising cookies are loaded during your session.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                3. Google Analytics 4 (GA4)
              </h2>
              <p>
                We utilize Google Analytics 4 to collect aggregate, anonymized technical metrics such as page views, browser type, device category, referring sources, and geographic region. This data is strictly used to evaluate site stability, optimize server responsiveness, and improve user experience. No personally identifiable information (PII) is transmitted to Google Analytics.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                4. Temporary Mailbox Data Retention & Automatic Erasure
              </h2>
              <p>
                The fundamental core of TempMail is automated data destruction:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Default Lifetime:</strong> Every temporary email address expires after 30 minutes unless extended by the user.
                </li>
                <li>
                  <strong>Automated Deletion:</strong> Inbound emails, subject headers, message bodies, and attachments are stored temporarily in volatile database memory and are completely and permanently purged by our automated background cleanup workers.
                </li>
                <li>
                  <strong>No Permanent Archives:</strong> Once an email expires or is manually deleted by you via the "Delete" button, it cannot be restored or recovered by anyone.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                5. Log Files & Server Diagnostics
              </h2>
              <p>
                Like most standard web servers, TempMail logs basic technical diagnostic requests. This includes IP addresses, browser user-agent strings, timestamps, and HTTP response codes. These logs are stored temporarily for rate-limiting enforcement, DDoS defense, bot protection, and abuse prevention, and are automatically overwritten.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                6. GDPR (European Union) & CCPA / CPRA (California) Privacy Rights
              </h2>
              <p>
                Under the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA/CPRA), users possess rights regarding their personal data, including the right to access, rectify, or request deletion of data. Because TempMail operates anonymously for disposable mail without storing personal identifiers, we do not sell or monetize personal user records.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                7. Contact Information
              </h2>
              <p>
                If you have questions, feedback, or require additional information regarding our Privacy Policy or cookie usage, please contact our support team at:
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
