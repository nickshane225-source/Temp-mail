import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Post not found');
        return res.json();
      })
      .then((data) => {
        setPost(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load article');
        setLoading(false);
      });
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* Navigation */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            ← All Articles
          </Link>
          <Link to="/" className="text-sm font-medium hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            Go to Inbox
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent"></div>
          </div>
        ) : error || !post ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <h1 className="text-2xl font-bold mb-2">Article Not Found</h1>
            <p className="text-slate-500 mb-6">{error || "The article you are looking for doesn't exist or has been unlisted."}</p>
            <Link to="/blog" className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700">
              Return to Blog
            </Link>
          </div>
        ) : (
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-12 shadow-sm">
            <header className="mb-8 pb-8 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
                <span>Privacy & Security</span>
                <span>•</span>
                <time dateTime={post.createdAt}>
                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-4">
                {post.title}
              </h1>
              {post.metaDescription && (
                <p className="text-lg text-slate-600 dark:text-slate-400 italic">
                  {post.metaDescription}
                </p>
              )}
            </header>

            {/* Sanitized Article Body */}
            <div
              className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed space-y-4"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  post.body.includes('<p>')
                    ? post.body
                    : post.body
                        .split('\n\n')
                        .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                        .join('')
                ),
              }}
            />

            <footer className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-500">
              <div>Written by <strong className="text-slate-700 dark:text-slate-300">{post.author || 'TempMail Security Team'}</strong></div>
              <Link to="/" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
                Try TempMail Free
              </Link>
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
