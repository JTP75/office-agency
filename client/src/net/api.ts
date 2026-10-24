// Small helpers for the token-gated server API (PROTOCOL.md).

export const token = new URLSearchParams(location.search).get("t") ?? "";

export function apiUrl(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ t: token });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return `/api/${path}?${q}`;
}

export const agentPath = (id: string, verb: string) => `agents/${encodeURIComponent(id)}/${verb}`;

/** POST JSON; resolves to the parsed body, throws with the server's message on failure. */
export async function post(path: string, body: unknown = {}) {
  const res = await fetch(apiUrl(path), { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `${res.status} ${res.statusText}`);
  return data;
}
