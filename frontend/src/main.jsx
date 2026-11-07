import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
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

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
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
    </AuthProvider>
  </BrowserRouter>
);
