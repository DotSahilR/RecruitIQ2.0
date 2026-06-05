// Minimal client-side API helper. Frontend should call the Express API instead
export async function getGreeting(name: string) {
  const API = import.meta.env.VITE_API_URL || "/";
  const res = await fetch(`${API.replace(/\/$/, "")}/api/greeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to fetch greeting");
  return res.json();
}
