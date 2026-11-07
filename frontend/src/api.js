export async function api(path, { method = 'GET', body, token, headers: customHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...customHeaders };
  if (token) headers['x-mailbox-token'] = token;
  const t = localStorage.getItem('tm_admin');
  if (t && path.startsWith('/admin')) headers.Authorization = `Bearer ${t}`;
  const userToken = localStorage.getItem('tm_user_token');
  if (userToken && !headers.Authorization) headers.Authorization = `Bearer ${userToken}`;
  if (path.startsWith('/mailbox') && !headers['x-mailbox-token']) {
    try {
      const boxData = JSON.parse(localStorage.getItem('tm_box') || '{}');
      if (boxData?.token) {
        headers['x-mailbox-token'] = boxData.token;
      }
    } catch {}
  }
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}
