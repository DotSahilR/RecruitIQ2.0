export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

export async function apiFetch(input: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${input}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Server returned ${response.status}`);
  }
  return response;
}
