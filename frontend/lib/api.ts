export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, cache: 'no-store' });
  if (!res.ok) {
    try {
      const data = await res.json();
      throw new Error(data?.error || `GET ${path} failed: ${res.status}`);
    } catch {
      throw new Error(`GET ${path} failed: ${res.status}`);
    }
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body?: any, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
  if (!res.ok) {
    try {
      const data = await res.json();
      throw new Error(data?.error || `POST ${path} failed: ${res.status}`);
    } catch {
      throw new Error(`POST ${path} failed: ${res.status}`);
    }
  }
  return res.json() as Promise<T>;
}
