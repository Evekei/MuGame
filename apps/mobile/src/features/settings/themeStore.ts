"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
}

const STORAGE_KEY = "mugame.theme.preference";
const initialState: ThemeState = { preference: "system" };
let state = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = preference;
}

function persistTheme(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, preference);
}

export function hydrateThemeState() {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  hydrated = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  state = {
    preference: isThemePreference(stored) ? stored : "system"
  };
  applyTheme(state.preference);
  emit();
}

export function getThemeState() {
  return state;
}

export function setThemePreference(preference: ThemePreference) {
  state = { preference };
  applyTheme(preference);
  persistTheme(preference);
  emit();
}

export function resetThemeState() {
  hydrated = false;
  state = initialState;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  applyTheme("system");
  emit();
}

export function subscribeThemeStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemeStore() {
  return useSyncExternalStore(
    subscribeThemeStore,
    getThemeState,
    getThemeState
  );
}
