package com.mugame.mobile.plugins;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

final class RevealTrack {
    final String neteaseSongId;
    final String title;
    final Set<String> normalizedArtists;
    final String album;
    final Long durationMs;
    final List<String> contributors;

    private RevealTrack(
        String neteaseSongId,
        String title,
        Set<String> normalizedArtists,
        String album,
        Long durationMs,
        List<String> contributors
    ) {
        this.neteaseSongId = neteaseSongId;
        this.title = title;
        this.normalizedArtists = normalizedArtists;
        this.album = album;
        this.durationMs = durationMs;
        this.contributors = contributors;
    }

    static RevealTrack fromJson(JSONObject item) {
        return new RevealTrack(
            item.optString("netease_song_id"),
            item.optString("display_title"),
            RevealTrackLocator.normalizeArtists(item.optJSONArray("artists")),
            item.optString("album", null),
            item.has("duration_ms") ? item.optLong("duration_ms") : null,
            contributorsFromJson(item.optJSONArray("contributors"))
        );
    }

    private static List<String> contributorsFromJson(JSONArray payload) {
        List<String> contributors = new ArrayList<>();
        if (payload == null) {
            return contributors;
        }
        for (int index = 0; index < payload.length(); index++) {
            JSONObject contributor = payload.optJSONObject(index);
            String nickname = contributor == null ? "" : contributor.optString("owner_nickname");
            if (!nickname.trim().isEmpty()) {
                contributors.add(nickname);
            }
        }
        return contributors;
    }
}
