"use client";

import { useState } from "react";
import { AccountAvatar } from "./AccountAvatar";
import { AccountSheet } from "./AccountSheet";
import { useAccountStore } from "./accountStore";

function entryLabel(status: ReturnType<typeof useAccountStore>["status"]) {
  if (status === "logged_in") {
    return "网易云";
  }

  if (status === "logging_in") {
    return "登录中";
  }

  return "登录";
}

export function AccountEntry() {
  const account = useAccountStore();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="account-entry"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <AccountAvatar profile={account.profile} />
        <span>
          {account.status === "logged_in" && account.profile
            ? account.profile.nickname
            : entryLabel(account.status)}
        </span>
      </button>
      <AccountSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
