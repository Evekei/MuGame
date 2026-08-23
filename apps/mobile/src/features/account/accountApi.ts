import type {
  NeteaseAccountSessionResponse,
  NeteaseSessionSnapshot
} from "@mugame/contracts/account";
import { deleteJson, getJson, postJson } from "@/lib/api/client";

export interface AccountApi {
  clearSession: () => Promise<NeteaseAccountSessionResponse>;
  readSession: () => Promise<NeteaseAccountSessionResponse>;
  saveSession: (
    snapshot: NeteaseSessionSnapshot
  ) => Promise<NeteaseAccountSessionResponse>;
}

export const accountApi: AccountApi = {
  clearSession: () =>
    deleteJson<NeteaseAccountSessionResponse>("/account/netease/session"),
  readSession: () =>
    getJson<NeteaseAccountSessionResponse>("/account/netease/session"),
  saveSession: (snapshot) =>
    postJson<NeteaseAccountSessionResponse>(
      "/account/netease/session",
      snapshot
    )
};
