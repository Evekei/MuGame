import { ApiClientError } from "@/lib/api/client";

export function playlistImportErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "歌单识别失败，请稍后重试。";
}
