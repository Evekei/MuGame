import { ApiClientError } from "@/lib/api/client";

export function playlistImportErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    const details = [
      error.code ? `code=${error.code}` : undefined,
      error.status ? `status=${error.status}` : undefined
    ].filter(Boolean);
    return details.length > 0 ? `${error.message}（${details.join("，")}）` : error.message;
  }

  return "歌单识别失败，请稍后重试。";
}
