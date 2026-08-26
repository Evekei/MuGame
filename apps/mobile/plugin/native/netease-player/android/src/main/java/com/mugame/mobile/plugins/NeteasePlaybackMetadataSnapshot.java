package com.mugame.mobile.plugins;

import com.getcapacitor.JSObject;

final class NeteasePlaybackMetadataSnapshot {
    final String status;
    final String packageName;
    final String title;
    final String artist;
    final String album;
    final Long durationMs;
    final String mediaId;
    final String playbackState;
    final long updatedAtMs;

    NeteasePlaybackMetadataSnapshot(
        String status,
        String packageName,
        String title,
        String artist,
        String album,
        Long durationMs,
        String mediaId,
        String playbackState,
        long updatedAtMs
    ) {
        this.status = status;
        this.packageName = packageName;
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.durationMs = durationMs;
        this.mediaId = mediaId;
        this.playbackState = playbackState;
        this.updatedAtMs = updatedAtMs;
    }

    static NeteasePlaybackMetadataSnapshot permissionRequired() {
        return new NeteasePlaybackMetadataSnapshot(
            "permission_required",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            System.currentTimeMillis()
        );
    }

    static NeteasePlaybackMetadataSnapshot notPlaying() {
        return new NeteasePlaybackMetadataSnapshot(
            "not_playing",
            NeteasePlaybackMonitorService.NETEASE_PACKAGE,
            null,
            null,
            null,
            null,
            null,
            null,
            System.currentTimeMillis()
        );
    }

    JSObject toJson() {
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("updated_at_ms", updatedAtMs);
        putIfPresent(result, "package_name", packageName);
        putIfPresent(result, "title", title);
        putIfPresent(result, "artist", artist);
        putIfPresent(result, "album", album);
        if (durationMs != null) {
            result.put("duration_ms", durationMs);
        }
        putIfPresent(result, "media_id", mediaId);
        putIfPresent(result, "playback_state", playbackState);
        return result;
    }

    private static void putIfPresent(JSObject result, String key, String value) {
        if (value != null && !value.trim().isEmpty()) {
            result.put(key, value);
        }
    }
}
