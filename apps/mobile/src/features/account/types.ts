export type AccountStatus =
  | "unknown"
  | "logged_out"
  | "logging_in"
  | "logged_in"
  | "expired"
  | "error";

export interface AccountProfile {
  userId: string;
  nickname: string;
  avatarUrl?: string;
}

export interface AccountState {
  status: AccountStatus;
  profile?: AccountProfile;
  errorMessage?: string;
  lastSyncedAt?: string;
}
