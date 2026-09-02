export function getFastApiBaseUrl(): string {
  return (process.env.FAKE_NEWS_API_BASE_URL?.trim() || "http://127.0.0.1:8000").replace(/\/$/, "");
}
