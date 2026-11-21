const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function api(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data;
}

export function socketUrl() {
  return import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
}
