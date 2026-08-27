import type {
  FullImportRequest,
  ImportHistoryItem,
  ImportSessionDeleteResponse,
  ImportSessionResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  MatchJobResponse,
  ManualMatchConfirmRequest,
  MatchedTrackItem,
  MatchTracksResponse,
  TempPlaylistSyncResponse
} from "@mugame/contracts/imports";
import { deleteJson, getJson, postJson } from "@/lib/api/client";

export interface ImportPreviewApi {
  confirmMatch: (
    sessionId: string,
    request: ManualMatchConfirmRequest
  ) => Promise<MatchedTrackItem>;
  deleteImportSession: (sessionId: string) => Promise<ImportSessionDeleteResponse>;
  getHistory: (limit?: number) => Promise<ImportHistoryItem[]>;
  getSession: (sessionId: string) => Promise<ImportSessionResponse>;
  getMatchJob: (jobId: string) => Promise<MatchJobResponse>;
  matchTracks: (sessionId: string) => Promise<MatchTracksResponse>;
  preview: (request: ImportPreviewRequest) => Promise<ImportPreviewResponse>;
  retryAnalytics: (sessionId: string) => Promise<ImportSessionResponse>;
  retryFullImport: (sessionId: string) => Promise<ImportSessionResponse>;
  restoreTempPlaylist: (sessionId: string) => Promise<ImportSessionResponse>;
  startMatchJob: (sessionId: string) => Promise<MatchJobResponse>;
  startFullImport: (request: FullImportRequest) => Promise<ImportSessionResponse>;
  startOrchestration: (request: FullImportRequest) => Promise<ImportSessionResponse>;
  syncTempPlaylist: (sessionId: string) => Promise<TempPlaylistSyncResponse>;
}

export const importPreviewApi: ImportPreviewApi = {
  confirmMatch: (sessionId, request) =>
    postJson<MatchedTrackItem>(
      `/imports/sessions/${sessionId}/matches/confirm`,
      request
    ),
  deleteImportSession: (sessionId) =>
    deleteJson<ImportSessionDeleteResponse>(`/imports/sessions/${sessionId}`),
  getHistory: (limit = 20) =>
    getJson<ImportHistoryItem[]>(`/imports/history?limit=${limit}`),
  getSession: (sessionId) =>
    getJson<ImportSessionResponse>(`/imports/sessions/${sessionId}`),
  getMatchJob: (jobId) => getJson<MatchJobResponse>(`/imports/match-jobs/${jobId}`),
  matchTracks: (sessionId) =>
    postJson<MatchTracksResponse>(`/imports/sessions/${sessionId}/match`, {}),
  preview: (request) => postJson<ImportPreviewResponse>("/imports/preview", request),
  retryAnalytics: (sessionId) =>
    postJson<ImportSessionResponse>(
      `/imports/sessions/${sessionId}/analytics/retry`,
      {}
    ),
  retryFullImport: (sessionId) =>
    postJson<ImportSessionResponse>(`/imports/sessions/${sessionId}/retry`, {}),
  restoreTempPlaylist: (sessionId) =>
    postJson<ImportSessionResponse>(
      `/imports/sessions/${sessionId}/restore-temp-playlist`,
      {}
    ),
  startMatchJob: (sessionId) =>
    postJson<MatchJobResponse>(`/imports/sessions/${sessionId}/match-jobs`, {}),
  startFullImport: (request) =>
    postJson<ImportSessionResponse>("/imports/full", request),
  startOrchestration: (request) =>
    postJson<ImportSessionResponse>("/imports/orchestrations", request),
  syncTempPlaylist: (sessionId) =>
    postJson<TempPlaylistSyncResponse>(
      `/imports/sessions/${sessionId}/temp-playlist/sync`,
      {}
    )
};
