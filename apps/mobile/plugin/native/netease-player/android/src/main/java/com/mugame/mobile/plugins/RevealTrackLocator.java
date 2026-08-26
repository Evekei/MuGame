package com.mugame.mobile.plugins;

import java.text.Normalizer;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

final class RevealTrackLocator {
    private static final int DURATION_TOLERANCE_MS = 5000;

    private RevealTrackLocator() {}

    static RevealTrack locate(List<RevealTrack> tracks, NeteasePlaybackMetadataSnapshot metadata) {
        if (!"ready".equals(metadata.status)) {
            return null;
        }
        RevealTrack mediaIdMatch = locateByMediaId(tracks, metadata.mediaId);
        if (mediaIdMatch != null) {
            return mediaIdMatch;
        }

        String metadataTitle = normalize(metadata.title);
        Set<String> metadataArtists = normalizeArtists(metadata.artist);
        if (metadataTitle.isEmpty() || metadataArtists.isEmpty()) {
            return null;
        }
        return locateByMetadata(tracks, metadata, metadataTitle, metadataArtists);
    }

    static Set<String> normalizeArtists(JSONArray artists) {
        Set<String> result = new HashSet<>();
        if (artists == null) {
            return result;
        }
        for (int index = 0; index < artists.length(); index++) {
            String value = normalize(artists.optString(index));
            if (!value.isEmpty()) {
                result.add(value);
            }
        }
        return result;
    }

    static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .toLowerCase()
            .replaceAll("\\s+", "")
            .replaceAll("[《》\"'`.,，。:：()\\[\\]（）【】]", "");
    }

    private static RevealTrack locateByMediaId(List<RevealTrack> tracks, String mediaId) {
        if (mediaId == null || mediaId.trim().isEmpty()) {
            return null;
        }
        String normalizedMediaId = mediaId.trim();
        String numericMediaId = normalizedMediaId.replaceAll("\\D+", "");
        RevealTrack match = null;
        for (RevealTrack track : tracks) {
            if (!sameSongId(normalizedMediaId, numericMediaId, track.neteaseSongId)) {
                continue;
            }
            if (match != null) {
                return null;
            }
            match = track;
        }
        return match;
    }

    private static RevealTrack locateByMetadata(
        List<RevealTrack> tracks,
        NeteasePlaybackMetadataSnapshot metadata,
        String title,
        Set<String> artists
    ) {
        RevealTrack best = null;
        double bestScore = 0;
        boolean tied = false;
        for (RevealTrack track : tracks) {
            double score = scoreTrack(metadata, title, artists, track);
            if (score < 0.82) {
                continue;
            }
            if (score > bestScore + 0.04) {
                best = track;
                bestScore = score;
                tied = false;
            } else if (Math.abs(score - bestScore) < 0.04) {
                tied = true;
            }
        }
        return tied ? null : best;
    }

    private static double scoreTrack(
        NeteasePlaybackMetadataSnapshot metadata,
        String metadataTitle,
        Set<String> metadataArtists,
        RevealTrack track
    ) {
        double score = normalize(track.title).equals(metadataTitle) ? 0.62 : 0;
        score += artistOverlap(metadataArtists, track.normalizedArtists) * 0.28;
        if (metadata.durationMs != null && track.durationMs != null) {
            score += Math.abs(metadata.durationMs - track.durationMs) <= DURATION_TOLERANCE_MS
                ? 0.08
                : -0.08;
        }
        if (metadata.album != null && track.album != null && normalize(metadata.album).equals(normalize(track.album))) {
            score += 0.02;
        }
        return Math.max(0, Math.min(1, score));
    }

    private static boolean sameSongId(
        String mediaId,
        String numericMediaId,
        String trackSongId
    ) {
        if (trackSongId == null || trackSongId.trim().isEmpty()) {
            return false;
        }
        String normalizedTrackId = trackSongId.trim();
        if (mediaId.equals(normalizedTrackId)) {
            return true;
        }
        if (mediaId.contains(normalizedTrackId)) {
            return true;
        }
        String numericTrackId = normalizedTrackId.replaceAll("\\D+", "");
        return !numericMediaId.isEmpty() && numericMediaId.equals(numericTrackId);
    }

    private static double artistOverlap(Set<String> left, Set<String> right) {
        if (left.isEmpty() || right.isEmpty()) {
            return 0;
        }
        int overlap = 0;
        for (String artist : left) {
            if (right.contains(artist)) {
                overlap += 1;
            }
        }
        return (double) overlap / Math.max(left.size(), right.size());
    }

    private static Set<String> normalizeArtists(String value) {
        Set<String> result = new HashSet<>();
        if (value == null) {
            return result;
        }
        for (String item : value.split("[/,，、&＆;；]")) {
            String artist = normalize(item);
            if (!artist.isEmpty()) {
                result.add(artist);
            }
        }
        return result;
    }
}
