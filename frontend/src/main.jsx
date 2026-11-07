import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx';
import { ThemedToaster } from './components/ui/ThemedToaster.jsx';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import ShareView from './pages/ShareView.jsx';
import Blog from './pages/Blog.jsx';
import BlogPost from './pages/BlogPost.jsx';
import ApiDocs from './pages/ApiDocs.jsx';
import Premium from './pages/Premium.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Account from './pages/Account.jsx';
import ConfirmLink from './pages/ConfirmLink.jsx';
import './styles.css';

// Register PWA Service Worker (App Shell caching only)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Tracks pageviews across Single Page App route changes in Google Analytics 4
function AnalyticsTracker() {
  const location = useLocation();
  React.useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location]);
  return null;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AnalyticsTracker />
    <AuthProvider>
      <ConfirmProvider>
        <ThemedToaster />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/share/:token" element={<ShareView />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/api/docs" element={<ApiDocs />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/account" element={<Account />} />
          <Route path="/confirm-link" element={<ConfirmLink />} />
        </Routes>
      </ConfirmProvider>
    </AuthProvider>
  </BrowserRouter>
);
