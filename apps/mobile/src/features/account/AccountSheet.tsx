"use client";

import { useState } from "react";
import { AccountAvatar } from "./AccountAvatar";
import {
  loginNetease,
  logoutNetease,
  syncNeteaseAccount
} from "./accountService";
import { useAccountStore } from "./accountStore";

interface AccountSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

function accountStatusText(status: ReturnType<typeof useAccountStore>["status"]) {
  const labels = {
    unknown: "正在确认登录状态",
    logged_out: "未登录",
    logging_in: "登录中",
    logged_in: "已登录",
    expired: "登录已过期",
    error: "账号状态异常"
  };

  return labels[status];
}

export function AccountSheet({ isOpen, onClose }: AccountSheetProps) {
  const account = useAccountStore();
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const loggedInProfile =
    account.status === "logged_in" ? account.profile : undefined;
  const isBusy = Boolean(pendingAction) || account.status === "logging_in";

  async function runAction(actionName: string, action: () => Promise<void>) {
    if (actionName === "login") {
      console.info("login button clicked");
    }

    setPendingAction(actionName);
    try {
      await action();
    } finally {
      setPendingAction(undefined);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="account-sheet-backdrop" role="presentation">
      <section
        aria-labelledby="account-sheet-title"
        className="account-sheet"
        role="dialog"
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 id="account-sheet-title">网易云账号</h2>
          <button className="icon-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>

        <div className="account-summary">
          <AccountAvatar profile={account.profile} size="large" />
          <div>
            <p className="account-name">
              {loggedInProfile ? loggedInProfile.nickname : "当前账号"}
            </p>
            <p className="account-status">{accountStatusText(account.status)}</p>
          </div>
        </div>

        {account.errorMessage ? (
          <p className="account-error">{account.errorMessage}</p>
        ) : null}

        <div className="sheet-actions">
          <button
            className="primary-action"
            disabled={isBusy}
            onClick={() => void runAction("login", loginNetease)}
            type="button"
          >
            {loggedInProfile ? "重新登录" : "登录"}
          </button>
          <button
            className="secondary-action"
            disabled={isBusy}
            onClick={() => void runAction("sync", syncNeteaseAccount)}
            type="button"
          >
            同步登录状态
          </button>
          <button
            className="secondary-action"
            disabled={isBusy}
            onClick={() => void runAction("logout", logoutNetease)}
            type="button"
          >
            退出登录
          </button>
        </div>
      </section>
    </div>
  );
}
