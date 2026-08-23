export type NeteaseAccountSessionStatus =
  | "logged_in"
  | "logged_out"
  | "expired";

export interface NeteaseAccountProfile {
  user_id: string;
  nickname: string;
  avatar_url?: string;
}

export interface NeteaseSessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export interface NeteaseSessionSnapshot {
  cookies: NeteaseSessionCookie[];
  captured_at?: string;
}

export interface NeteaseAccountSessionResponse {
  status: NeteaseAccountSessionStatus;
  profile?: NeteaseAccountProfile;
  checked_at: string;
}
