import Image from "next/image";
import type { AccountProfile } from "./types";

interface AccountAvatarProps {
  profile?: AccountProfile;
  size?: "small" | "large";
}

export function AccountAvatar({ profile, size = "small" }: AccountAvatarProps) {
  const className = `account-avatar account-avatar-${size}`;

  if (profile?.avatarUrl) {
    return (
      <Image
        alt=""
        className={className}
        height={size === "large" ? 56 : 28}
        src={profile.avatarUrl}
        width={size === "large" ? 56 : 28}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {profile?.nickname.slice(0, 1) ?? "网"}
    </span>
  );
}
