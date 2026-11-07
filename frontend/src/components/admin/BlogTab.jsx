import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useConfirm } from '../ui/ConfirmDialog';

export default function BlogTab() {
  const confirm = useConfirm();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState(null);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [saving, setSaving] = useState(false);

  // Gemini AI Automation state
  const [aiStatus, setAiStatus] = useState(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api('/admin/posts');
      setPosts(Array.isArray(list) ? list : []);
    } catch {}
    setLoading(false);
  }, []);

  const loadAiStatus = useCallback(async () => {
    try {
      const status = await api('/admin/blog/ai-status');
      setAiStatus(status);
    } catch {}
  }, []);

  useEffect(() => {
    loadPosts();
    loadAiStatus();
  }, [loadPosts, loadAiStatus]);

  const handleStartNew = () => {
    setEditingPost({
      title: '',
      slug: '',
      body: '',
      metaDescription: '',
      coverImage: '',
      tags: [],
      published: false,
    });
    setPreviewMarkdown(false);
  };

  const handleDuplicate = (post) => {
    setEditingPost({
      title: `${post.title} (Copy)`,
      slug: `${post.slug}-copy-${Date.now().toString().slice(-4)}`,
      body: post.body,
      metaDescription: post.metaDescription,
      coverImage: post.coverImage || '',
      tags: post.tags || [],
      published: false,
    });
    setPreviewMarkdown(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingPost._id) {
        await api(`/admin/posts/${editingPost._id}`, {
          method: 'PUT',
          body: editingPost,
        });
      } else {
        await api('/admin/posts', {
          method: 'POST',
          body: editingPost,
        });
      }
      setEditingPost(null);
      loadPosts();
      toast.success('Blog post saved successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to save post.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    const ok = await confirm({
      title: 'Delete Blog Post',
      description: `Are you sure you want to permanently delete "${title}"?`,
      confirmText: 'Delete Post',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api(`/admin/posts/${id}`, { method: 'DELETE' });
      loadPosts();
      toast.success('Blog post deleted.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete post.');
    }
  };

  const handleGenerateAiPost = async () => {
    if (!aiStatus?.hasKey) {
      setShowKeyModal(true);
      return;
    }

    setGeneratingAi(true);
    toast.info('Gemini AI is researching cybersecurity trends and generating the article...');
    try {
      const res = await api('/admin/blog/generate-ai', { method: 'POST' });
      await loadPosts();
      await loadAiStatus();
      toast.success(`Published AI Post: "${res.post?.title || 'New Article'}"!`);
    } catch (err) {
      toast.error(err.message || 'Failed to generate post with Gemini.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSaveGeminiKey = async (e) => {
    e.preventDefault();
    setSavingKey(true);
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: { geminiApiKey: keyInput.trim() },
      });
      setShowKeyModal(false);
      setKeyInput('');
      await loadAiStatus();
      toast.success('Gemini API key saved securely in MongoDB settings.');
    } catch (err) {
      toast.error(err.message || 'Failed to save Gemini API key.');
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Blog & SEO Publishing Studio
          </h2>
          <p className="text-xs text-slate-500">
            Publish educational articles, feature announcements, and automated AI security research
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGenerateAiPost}
            disabled={generatingAi}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {generatingAi ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Researching & Writing...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Generate Post Now with Gemini</span>
              </>
            )}
          </button>

          <button
            onClick={handleStartNew}
            className="px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            + Write Manual Post
          </button>
        </div>
      </div>

      {/* Gemini AI Automation & 7-Day Purge Status Banner */}
      <div className="bg-gradient-to-br from-teal-900/15 via-slate-900/5 to-cyan-900/10 dark:from-teal-950/40 dark:via-slate-900 dark:to-cyan-950/30 border border-teal-500/30 rounded-3xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                Autonomous AI Publisher
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Schedule: <strong className="text-slate-700 dark:text-slate-200">Every 24 Hours</strong>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">•</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Retention: <strong className="text-amber-600 dark:text-amber-400">7 Days (Auto-Purged)</strong>
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {aiStatus?.hasKey ? (
                <span>
                  ✓ Gemini API Key active (via <code className="text-teal-600 font-bold">{aiStatus.keySource}</code>: {aiStatus.maskedKey}). Auto-generates privacy research with image cover and purges 7-day-old posts from MongoDB automatically.
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  ⚠️ No Gemini API key detected. Please add your key below or set GEMINI_API_KEY in .env.
                </span>
              )}
            </div>
            {aiStatus?.lastCleanup && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex items-center gap-2">
                <span>🧹 MongoDB 7-Day Cleanup:</span>
                <span className="font-semibold text-teal-700 dark:text-teal-300">
                  {aiStatus.lastCleanup.totalDeleted || 0} total records removed
                </span>
                <span>({aiStatus.lastCleanup.autoBlogPostsDeleted || 0} expired AI posts, {aiStatus.lastCleanup.messagesDeleted || 0} messages)</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={() => setShowKeyModal(true)}
              className="px-3 py-1.5 rounded-xl border border-teal-500/40 hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              ⚙️ {aiStatus?.hasKey ? 'Update Gemini Key' : 'Configure Gemini Key'}
            </button>
          </div>
        </div>
      </div>

      {/* Gemini Key Config Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Configure Google Gemini API Key
              </h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Enter your Google AI Studio Gemini API key. It will be stored in your MongoDB system settings and used for 24-hour autonomous research, content writing, and image generation.
            </p>

            <form onSubmit={handleSaveGeminiKey} className="space-y-4">
              <input
                type="password"
                required
                placeholder="AIzaSy..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono select-all outline-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKey || !keyInput.trim()}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingKey ? 'Saving...' : 'Save Gemini Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editor Modal / Panel */}
      {editingPost && (
        <div className="bg-white dark:bg-slate-900 border border-teal-500/50 rounded-3xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {editingPost._id ? 'Edit Blog Article' : 'Compose New Article'}
            </h3>
            <button
              onClick={() => setEditingPost(null)}
              className="text-slate-400 hover:text-slate-600 font-bold text-lg"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Article Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5 Reasons to Use Disposable Temp Mail for QA"
                  value={editingPost.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    const slug = editingPost._id
                      ? editingPost.slug
                      : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    setEditingPost({ ...editingPost, title, slug });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Slug (URL Path)
                </label>
                <input
                  type="text"
                  required
                  placeholder="5-reasons-disposable-temp-mail"
                  value={editingPost.slug}
                  onChange={(e) =>
                    setEditingPost({
                      ...editingPost,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''),
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Cover Image (Data URI, AI Generated Image, or Image URL)
              </label>
              <input
                type="text"
                placeholder="https://... or data:image/png;base64,... (optional cover banner)"
                value={editingPost.coverImage || ''}
                onChange={(e) => setEditingPost({ ...editingPost, coverImage: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Meta Description (Search Snippet)
              </label>
              <textarea
                rows={2}
                placeholder="Short summary for SEO meta tags and social media cards..."
                value={editingPost.metaDescription || ''}
                onChange={(e) => setEditingPost({ ...editingPost, metaDescription: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Article Body (Markdown)
                </label>
                <button
                  type="button"
                  onClick={() => setPreviewMarkdown(!previewMarkdown)}
                  className="text-xs text-teal-600 font-semibold hover:underline"
                >
                  {previewMarkdown ? 'Switch to Edit' : 'Preview HTML'}
                </button>
              </div>

              {previewMarkdown ? (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 prose dark:prose-invert max-w-none text-xs min-h-[220px]">
                  {editingPost.body}
                </div>
              ) : (
                <textarea
                  rows={9}
                  required
                  placeholder="Write article content using markdown syntax (# Heading, ## Section, **bold**, etc.)..."
                  value={editingPost.body}
                  onChange={(e) => setEditingPost({ ...editingPost, body: e.target.value })}
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                <input
                  type="checkbox"
                  checked={!!editingPost.published}
                  onChange={(e) => setEditingPost({ ...editingPost, published: e.target.checked })}
                  className="w-4 h-4 rounded text-teal-600"
                />
                <span>Published & Publicly Visible</span>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPost(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  {saving ? 'Saving...' : editingPost._id ? 'Update Post' : 'Publish Article'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Posts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading blog articles...</div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No posts published yet. Click "Generate Post Now with Gemini" or "+ Write Manual Post" to publish.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Article & Cover</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Source / Type</th>
                  <th className="py-3 px-4">Visibility</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {posts.map((p) => {
                  const daysLeft = p.expiresAt
                    ? Math.max(0, Math.ceil((new Date(p.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                    : null;

                  return (
                    <tr key={p._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          {p.coverImage ? (
                            <img
                              src={p.coverImage}
                              alt=""
                              className="w-12 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 flex-none"
                            />
                          ) : (
                            <div className="w-12 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-400 flex-none">
                              📝
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {p.title}
                            </span>
                            <span className="text-[11px] text-slate-400 line-clamp-1">
                              By {p.author || 'TempMail Team'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        /blog/{p.slug}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.isAutoGenerated ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-500/20 w-fit">
                              ✨ Gemini AI
                            </span>
                            {daysLeft !== null && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                Purges in {daysLeft}d
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 w-fit">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.published
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}
                        >
                          {p.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-2">
                        <button
                          onClick={() => handleDuplicate(p)}
                          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => setEditingPost(p)}
                          className="text-teal-600 hover:text-teal-700 font-semibold cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p._id, p.title)}
                          className="text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
