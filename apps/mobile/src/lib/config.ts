const DEFAULT_API_BASE_URL = "http://localhost:8000";

export function getApiBaseUrl() {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL cannot be empty.");
  }

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid URL.");
  }
}
