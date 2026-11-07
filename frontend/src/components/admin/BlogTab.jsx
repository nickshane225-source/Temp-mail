import React, { useState, useEffect } from 'react';
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

  const loadPosts = async () => {
    setLoading(true);
    try {
      const list = await api('/admin/posts');
      setPosts(Array.isArray(list) ? list : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleStartNew = () => {
    setEditingPost({
      title: '',
      slug: '',
      body: '',
      metaDescription: '',
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Blog & SEO Publishing Studio
          </h2>
          <p className="text-xs text-slate-500">
            Publish educational articles, feature announcements, and SEO content for organic growth
          </p>
        </div>

        <button
          onClick={handleStartNew}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
        >
          + Write New Post
        </button>
      </div>

      {/* Editor Modal / Panel */}
      {editingPost && (
        <div className="bg-white dark:bg-slate-900 border border-teal-500/50 rounded-3xl p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
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
                    const slug = title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)+/g, '');
                    setEditingPost((p) => ({
                      ...p,
                      title,
                      slug: p._id ? p.slug : slug,
                    }));
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  URL Slug
                </label>
                <input
                  type="text"
                  required
                  placeholder="5-reasons-to-use-disposable-temp-mail"
                  value={editingPost.slug}
                  onChange={(e) => setEditingPost({ ...editingPost, slug: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Meta Description (Search Engines)
              </label>
              <input
                type="text"
                placeholder="Short SEO snippet displayed in Google search results (max 160 chars)..."
                value={editingPost.metaDescription || ''}
                onChange={(e) => setEditingPost({ ...editingPost, metaDescription: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            {/* Google Search Result Preview */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 text-xs">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Google SERP Preview</div>
              <div className="text-blue-600 hover:underline font-medium text-sm truncate">
                {editingPost.title || 'Untitled Post'} | TempMail Blog
              </div>
              <div className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                https://yourdomain.com/blog/{editingPost.slug || 'slug'}
              </div>
              <div className="text-slate-500 text-[11px] mt-0.5 line-clamp-2">
                {editingPost.metaDescription || 'No meta description provided yet. Add one above for optimal search visibility.'}
              </div>
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
            No posts published yet. Click "+ Write New Post" to publish your first article.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Title</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Visibility</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {posts.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5 font-bold text-slate-800 dark:text-slate-200">
                      {p.title}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                      /blog/{p.slug}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.published
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
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
                        className="text-slate-500 hover:text-slate-700 font-semibold"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => setEditingPost(p)}
                        className="text-teal-600 hover:text-teal-700 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p._id, p.title)}
                        className="text-red-500 hover:text-red-700 font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
