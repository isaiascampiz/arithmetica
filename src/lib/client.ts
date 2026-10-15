export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && url !== '/api/auth' && url !== '/api/session' && url !== '/api/kiosk') {
    const refresh = await fetch('/api/session', { method: 'POST' });
    if (refresh.ok)
      res = await fetch(url, {
        method,
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
