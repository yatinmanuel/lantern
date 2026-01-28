export function getSessionHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
  }
  return headers;
}

export function withSessionHeaders(headers?: HeadersInit): HeadersInit {
  const base = getSessionHeaders();
  if (!headers) return base;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      base[key] = value;
    });
    return base;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      base[String(key)] = String(value);
    }
    return base;
  }
  return { ...(headers as Record<string, string>), ...base };
}
