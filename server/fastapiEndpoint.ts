export function getFastApiBaseUrl(): string {
  const value = process.env.FAKE_NEWS_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!value) {
    throw new Error("FAKE_NEWS_API_BASE_URL is required for FastAPI integration.");
  }
  return value;
}
