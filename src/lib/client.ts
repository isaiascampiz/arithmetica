/** getRandomValues remains available on a local HTTP preview; no weak-random fallback. */
export function clientId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
let sessionRefresh: Promise<boolean> | null = null;
function refreshSession() {
  // Mounted screens can discover an expired session together. Rotate its
  // cookie once, then replay each request with its original payload.
  return (sessionRefresh ??= fetch('/api/session', { method: 'POST', cache: 'no-store' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      sessionRefresh = null;
    }));
}

export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  let res = await fetch(url, options);
  const pathname = url.split('?')[0];
  if (
    res.status === 401 &&
    !['/api/auth', '/api/session', '/api/kiosk'].some(
      (path) => pathname === path || pathname.startsWith(path + '/'),
    ) &&
    (await refreshSession())
  ) {
    res = await fetch(url, options);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `The server returned an unreadable response (HTTP ${res.status}). Please retry.`,
    );
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : res.status === 401
          ? 'Please sign in to continue.'
          : `Request failed (HTTP ${res.status}). Please retry.`;
    throw new Error(message);
  }
  return data as T;
}
