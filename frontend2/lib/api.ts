export const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://job-hunter-ai-koe0.onrender.com/api';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function apiGet<T>(path: string, token?: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: json?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: 'Network error — check your connection' };
  }
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: json?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: 'Network error — check your connection' };
  }
}
