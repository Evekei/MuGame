"use client";

import { useEffect, useState } from "react";
import {
  hydrateThemeState,
  setThemePreference,
  type ThemePreference,
  useThemeStore
} from "./themeStore";

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" }
];

export function SettingsEntry() {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useThemeStore();

  useEffect(() => {
    hydrateThemeState();
  }, []);

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="settings-entry"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        设置
      </button>
      {isOpen ? (
        <div className="account-sheet-backdrop" role="presentation">
          <section
            aria-labelledby="settings-sheet-title"
            className="account-sheet"
            role="dialog"
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h2 id="settings-sheet-title">设置</h2>
              <button
                className="icon-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                关闭
              </button>
            </div>

            <fieldset className="theme-choice">
              <legend>主题</legend>
              {themeOptions.map((option) => (
                <label key={option.value}>
                  <input
                    checked={theme.preference === option.value}
                    name="theme"
                    onChange={() => setThemePreference(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          </section>
        </div>
      ) : null}
    </>
  );
}
