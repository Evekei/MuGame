"use client";

import type {
  ImportSessionResponse,
  MatchedTrackItem,
  PlaylistPreviewItem
} from "@mugame/contracts/imports";
import { useSyncExternalStore } from "react";

export interface ReadyToPlayPayload {
  tempPlaylistId: string;
  tracks: MatchedTrackItem[];
}

export interface ImportFlowState {
  importTrackLimit?: number;
  previewItems: PlaylistPreviewItem[];
  rawShareText: string;
  readyPayload?: ReadyToPlayPayload;
  session?: ImportSessionResponse;
  sessionId?: string;
  updatedAt?: string;
}

const STORAGE_KEY = "mugame.import.flow";
const initialState: ImportFlowState = {
  previewItems: [],
  rawShareText: ""
};
let state = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function persist(nextState: ImportFlowState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function normalizeStoredState(value: unknown): ImportFlowState {
  if (!isRecord(value)) {
    return initialState;
  }
  return {
    importTrackLimit:
      typeof value.importTrackLimit === "number" ? value.importTrackLimit : undefined,
    previewItems: Array.isArray(value.previewItems)
      ? (value.previewItems as PlaylistPreviewItem[])
      : [],
    rawShareText:
      typeof value.rawShareText === "string" ? value.rawShareText : "",
    readyPayload: isRecord(value.readyPayload)
      ? (value.readyPayload as unknown as ReadyToPlayPayload)
      : undefined,
    session: isRecord(value.session)
      ? (value.session as unknown as ImportSessionResponse)
      : undefined,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined
  };
}

function readyPayloadFromSession(
  session: ImportSessionResponse
): ReadyToPlayPayload | undefined {
  if (session.status !== "ready_to_play" || !session.playback) {
    return undefined;
  }
  return {
    tempPlaylistId: session.playback.temp_playlist_id,
    tracks: session.playback.tracks
  };
}

export function hydrateImportFlowState() {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  hydrated = true;
  try {
    state = normalizeStoredState(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null")
    );
  } catch {
    state = initialState;
  }
  emit();
}

export function getImportFlowState() {
  return state;
}

export function setImportFlowState(
  next:
    | Partial<ImportFlowState>
    | ((current: ImportFlowState) => ImportFlowState)
) {
  state =
    typeof next === "function"
      ? next(state)
      : { ...state, ...next, updatedAt: nowIso() };
  persist(state);
  emit();
}

export function setStoredImportSession(session: ImportSessionResponse) {
  const nextReadyPayload = readyPayloadFromSession(session);
  setImportFlowState((current) => ({
    ...current,
    readyPayload: stableReadyPayload(current.readyPayload, nextReadyPayload),
    session,
    sessionId: session.id,
    updatedAt: nowIso()
  }));
}

export function resetImportFlowState() {
  hydrated = false;
  state = initialState;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

export function subscribeImportFlowStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useImportFlowStore() {
  return useSyncExternalStore(
    subscribeImportFlowStore,
    getImportFlowState,
    getImportFlowState
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableReadyPayload(
  current: ReadyToPlayPayload | undefined,
  next: ReadyToPlayPayload | undefined
) {
  if (!next) {
    return current;
  }
  if (
    current &&
    current.tempPlaylistId === next.tempPlaylistId &&
    sameTrackList(current.tracks, next.tracks)
  ) {
    return current;
  }
  return next;
}

function sameTrackList(
  current: readonly MatchedTrackItem[],
  next: readonly MatchedTrackItem[]
) {
  return (
    current.length === next.length &&
    current.every((track, index) => track.id === next[index]?.id)
  );
}
