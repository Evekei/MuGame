import type { HealthResponse } from "@mugame/contracts/health";
import { getApiBaseUrl } from "@/lib/config";

const DEFAULT_TIMEOUT_MS = 8000;
type HttpMethod = "GET" | "POST" | "DELETE";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly url?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  timeoutMs?: number;
}

async function requestJson<T>(path: string, options: RequestOptions = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = `${getApiBaseUrl()}${path}`;
  const headers: HeadersInit = {
    Accept: "application/json"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      method: options.method ?? "GET",
      signal: controller.signal
    });

    const body = (await response.json().catch(() => undefined)) as
      | ErrorResponse
      | T
      | undefined;

    if (!response.ok) {
      const errorBody = body as ErrorResponse | undefined;
      throw new ApiClientError(
        errorBody?.error?.message ?? "API request failed.",
        response.status,
        errorBody?.error?.code,
        url
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("API request timed out.", undefined, "timeout", url);
    }

    throw new ApiClientError("API request failed.", undefined, "network_error", url);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getHealth() {
  return requestJson<HealthResponse>("/health");
}

export function getJson<T>(path: string) {
  return requestJson<T>(path);
}

export function postJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, { body, method: "POST" });
}

export function deleteJson<T>(path: string) {
  return requestJson<T>(path, { method: "DELETE" });
}
