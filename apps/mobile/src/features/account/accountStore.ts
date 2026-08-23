"use client";

import { useSyncExternalStore } from "react";
import type { AccountState } from "./types";

const initialState: AccountState = {
  status: "logged_out"
};

let state = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAccountState() {
  return state;
}

export function setAccountState(nextState: AccountState) {
  state = nextState;
  emit();
}

export function resetAccountState() {
  setAccountState(initialState);
}

export function subscribeAccountStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAccountStore() {
  return useSyncExternalStore(
    subscribeAccountStore,
    getAccountState,
    getAccountState
  );
}
