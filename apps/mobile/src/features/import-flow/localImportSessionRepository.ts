"use client";

import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite } from "@capacitor-community/sqlite";
import type {
  ImportHistoryItem,
  ImportSessionResponse,
  MatchedTrackItem,
  TempPlaylistSyncResponse
} from "@mugame/contracts/imports";

const DATABASE = "mugame_local";
const STORAGE_KEY = "mugame.local.import.sessions";
let initialized: Promise<void> | undefined;

interface StoredSession {
  session_id: string;
  status: string;
  ready_to_play_at?: string;
  updated_at: string;
  payload_json: string;
}

export async function saveLocalImportSession(session: ImportSessionResponse) {
  const row = toStoredSession(session);
  if (!usesNativeSqlite()) {
    saveFallbackRow(row);
    return;
  }
  await ensureDatabase();
  await CapacitorSQLite.run({
    database: DATABASE,
    statement: `
      INSERT OR REPLACE INTO import_sessions
        (session_id, status, ready_to_play_at, updated_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    values: [
      row.session_id,
      row.status,
      row.ready_to_play_at ?? null,
      row.updated_at,
      row.payload_json
    ]
  });
}

export async function readLocalImportSession(sessionId: string) {
  if (!usesNativeSqlite()) {
    return fallbackRows()
      .map(sessionFromRow)
      .find((session) => session?.id === sessionId);
  }
  await ensureDatabase();
  const result = await CapacitorSQLite.query({
    database: DATABASE,
    statement: "SELECT payload_json FROM import_sessions WHERE session_id = ?",
    values: [sessionId]
  });
  const row = result.values?.[0] as { payload_json?: string } | undefined;
  return row?.payload_json ? parseSession(row.payload_json) : undefined;
}

export async function listLocalImportHistory(limit = 20) {
  const rows = usesNativeSqlite()
    ? await queryHistoryRows(limit)
    : fallbackRows().slice(0, limit);
  return rows
    .map(sessionFromRow)
    .filter((session): session is ImportSessionResponse => Boolean(session))
    .filter((session) => session.status === "ready_to_play")
    .map(historyItemFromSession)
    .filter((item): item is ImportHistoryItem => Boolean(item))
    .slice(0, limit);
}

export async function deleteLocalImportSession(sessionId: string) {
  if (!usesNativeSqlite()) {
    const rows = fallbackRows().filter((row) => row.session_id !== sessionId);
    writeFallbackRows(rows);
    return;
  }
  await ensureDatabase();
  await CapacitorSQLite.run({
    database: DATABASE,
    statement: "DELETE FROM import_sessions WHERE session_id = ?",
    values: [sessionId]
  });
}

export function localPlaybackSongIds(session: ImportSessionResponse) {
  return (session.playback?.tracks ?? session.matched_tracks)
    .map(playableSongId)
    .filter((songId): songId is string => Boolean(songId));
}

export function sessionWithTempPlaylistSync(
  session: ImportSessionResponse,
  sync: TempPlaylistSyncResponse
): ImportSessionResponse {
  const readyAt = sync.ready_at ?? new Date().toISOString();
  const playbackTracks = session.playback?.tracks ?? session.matched_tracks;
  return {
    ...session,
    progress: session.progress
      ? {
          ...session.progress,
          sync: {
            current: sync.synced_count,
            total: sync.synced_count + sync.failed_count
          }
        }
      : undefined,
    ready_to_play_at: readyAt,
    status: "ready_to_play",
    temp_playlist_id: sync.temp_playlist_id,
    updated_at: readyAt,
    playback: {
      temp_playlist_id: sync.temp_playlist_id,
      tracks: playbackTracks
    }
  };
}

export function usesNativeSqlite() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

async function ensureDatabase() {
  if (!initialized) {
    initialized = openDatabase();
  }
  await initialized;
}

async function openDatabase() {
  await CapacitorSQLite.createConnection({
    database: DATABASE,
    encrypted: false,
    mode: "no-encryption",
    version: 1
  }).catch((error) => {
    if (!isExistingConnectionError(error)) {
      throw error;
    }
  });
  const opened = await CapacitorSQLite.isDBOpen({ database: DATABASE }).catch(() => ({
    result: false
  }));
  if (!opened.result) {
    await CapacitorSQLite.open({ database: DATABASE });
  }
  await CapacitorSQLite.execute({
    database: DATABASE,
    statements: `
      CREATE TABLE IF NOT EXISTS import_sessions (
        session_id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        ready_to_play_at TEXT,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_import_sessions_ready
        ON import_sessions (ready_to_play_at, updated_at);
    `
  });
}

function isExistingConnectionError(error: unknown) {
  return error instanceof Error && /already|exist/i.test(error.message);
}

async function queryHistoryRows(limit: number) {
  await ensureDatabase();
  const result = await CapacitorSQLite.query({
    database: DATABASE,
    statement: `
      SELECT session_id, status, ready_to_play_at, updated_at, payload_json
      FROM import_sessions
      WHERE status = 'ready_to_play'
      ORDER BY COALESCE(ready_to_play_at, updated_at) DESC
      LIMIT ?
    `,
    values: [limit]
  });
  return (result.values ?? []) as StoredSession[];
}

function toStoredSession(session: ImportSessionResponse): StoredSession {
  return {
    session_id: session.id,
    status: session.status,
    ready_to_play_at: session.ready_to_play_at,
    updated_at: session.updated_at,
    payload_json: JSON.stringify(session)
  };
}

function sessionFromRow(row: StoredSession) {
  return parseSession(row.payload_json);
}

function parseSession(payload: string) {
  try {
    return JSON.parse(payload) as ImportSessionResponse;
  } catch {
    return undefined;
  }
}

function historyItemFromSession(
  session: ImportSessionResponse
): ImportHistoryItem | undefined {
  const readyAt = session.ready_to_play_at ?? session.updated_at;
  const tempPlaylistId = session.temp_playlist_id ?? session.playback?.temp_playlist_id;
  if (!readyAt || !tempPlaylistId) {
    return undefined;
  }
  return {
    session_id: session.id,
    ready_to_play_at: readyAt,
    temp_playlist_id: tempPlaylistId,
    playable_track_count: localPlaybackSongIds(session).length,
    source_playlists: session.source_playlists.map((source) => ({
      platform: source.platform,
      source_playlist_id: source.source_playlist_id,
      title: source.title,
      owner_nickname: source.owner_nickname,
      import_track_limit: source.import_track_limit,
      read_count: source.read_count
    })),
    owner_nicknames: ownerNicknames(session),
    created_at: session.created_at,
    updated_at: session.updated_at
  };
}

function ownerNicknames(session: ImportSessionResponse) {
  return Array.from(
    new Set(
      session.source_playlists
        .map((source) => source.owner_nickname)
        .filter(Boolean)
    )
  );
}

function playableSongId(track: MatchedTrackItem) {
  return track.netease_song_id && track.match_status !== "needs_confirm"
    ? track.netease_song_id
    : undefined;
}

function fallbackRows() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as StoredSession[];
  } catch {
    return [];
  }
}

function saveFallbackRow(row: StoredSession) {
  const rows = fallbackRows().filter((entry) => entry.session_id !== row.session_id);
  rows.unshift(row);
  writeFallbackRows(rows);
}

function writeFallbackRows(rows: StoredSession[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }
}
