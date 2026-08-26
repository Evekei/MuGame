package com.mugame.mobile.plugins;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NeteasePlayer")
public class NeteasePlayerPlugin extends Plugin {
    private static final String TAG = "MuGameNeteasePlayer";
    private static final String NETEASE_PACKAGE = "com.netease.cloudmusic";
    private static final String PLAYLIST_URL_PREFIX = "orpheus://playlist/";
    private static final String SONG_URL_PREFIX = "orpheus://song/";
    private static final String AUTOPLAY_SUFFIX = "/?autoplay=1";

    private String currentTrackId;
    private String preparedUrl;
    private boolean preparedPlaylist;
    private boolean externalOpened;
    private String lastError;
    private NeteaseFloatingSourceWindow floatingSourceWindow;
    private final NeteasePlaybackMonitorService.MetadataListener metadataListener =
        snapshot -> notifyListeners("neteasePlaybackMetadataChanged", snapshot.toJson());

    @Override
    public void load() {
        floatingSourceWindow = new NeteaseFloatingSourceWindow(getContext());
        NeteasePlaybackMonitorService.addListener(metadataListener);
    }

    @Override
    protected void handleOnDestroy() {
        if (floatingSourceWindow != null) {
            floatingSourceWindow.hide();
        }
        NeteasePlaybackMonitorService.removeListener(metadataListener);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        Log.i(TAG, "android external player bridge initialized");
        call.resolve();
    }

    @PluginMethod
    public void isPlaybackMonitorEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", NeteasePlaybackMonitorService.isEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void configureSourceReveal(PluginCall call) {
        if (floatingSourceWindow != null) {
            floatingSourceWindow.updateTracks(call.getArray("tracks"));
        }
        call.resolve();
    }

    @PluginMethod
    public void isFloatingWindowEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", floatingSourceWindow != null && floatingSourceWindow.canShow());
        call.resolve(result);
    }

    @PluginMethod
    public void openFloatingWindowSettings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openPlaybackMonitorSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void isPlaylistAutoplayEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", NeteasePlaylistAutoplayService.isEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openPlaylistAutoplaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getCurrentPlaybackMetadata(PluginCall call) {
        call.resolve(NeteasePlaybackMonitorService.current(getContext()).toJson());
    }

    @PluginMethod
    public void ensureLoggedIn(PluginCall call) {
        Log.i(TAG, "external NetEase app owns playback login state");
        call.resolve();
    }

    @PluginMethod
    public void loadTrack(PluginCall call) {
        String songId = call.getString("netease_song_id");
        if (songId == null || songId.trim().isEmpty()) {
            call.reject("netease_song_id is required.", "invalid_track_id");
            return;
        }
        currentTrackId = songId.trim();
        preparedPlaylist = false;
        prepareExternalUrl(SONG_URL_PREFIX + currentTrackId + AUTOPLAY_SUFFIX);
        Log.i(TAG, "external NetEase song prepared id=" + currentTrackId);
        call.resolve();
    }

    @PluginMethod
    public void loadPlaylist(PluginCall call) {
        String playlistId = call.getString("netease_playlist_id");
        if (playlistId == null || playlistId.trim().isEmpty()) {
            call.reject("netease_playlist_id is required.", "invalid_playlist_id");
            return;
        }
        currentTrackId = null;
        preparedPlaylist = true;
        prepareExternalUrl(PLAYLIST_URL_PREFIX + playlistId.trim() + AUTOPLAY_SUFFIX);
        Log.i(TAG, "external NetEase playlist prepared id=" + playlistId.trim());
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (preparedUrl == null) {
            call.reject("No NetEase playlist or song is prepared.", "player_not_initialized");
            return;
        }
        openPreparedUrl(call);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        call.reject(
            "Transport controls are not available in external NetEase app mode.",
            "player_action_unsupported"
        );
    }

    @PluginMethod
    public void next(PluginCall call) {
        call.reject(
            "Transport controls are not available in external NetEase app mode.",
            "player_action_unsupported"
        );
    }

    @PluginMethod
    public void previous(PluginCall call) {
        call.reject(
            "Transport controls are not available in external NetEase app mode.",
            "player_action_unsupported"
        );
    }

    @PluginMethod
    public void seek(PluginCall call) {
        call.reject(
            "Seek is not available when playback is handled by NetEase app.",
            "player_action_unsupported"
        );
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        if (externalOpened) {
            call.resolve(playbackState("playing"));
            return;
        }
        if (preparedUrl != null) {
            call.resolve(playbackState("paused"));
            return;
        }
        call.resolve(playbackState("idle"));
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        currentTrackId = null;
        preparedUrl = null;
        preparedPlaylist = false;
        externalOpened = false;
        lastError = null;
        if (floatingSourceWindow != null) {
            floatingSourceWindow.hide();
        }
        call.resolve();
    }

    private void prepareExternalUrl(String url) {
        preparedUrl = url;
        externalOpened = false;
        lastError = null;
    }

    private void openPreparedUrl(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Intent appIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(preparedUrl));
            appIntent.setPackage(NETEASE_PACKAGE);
            appIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (tryOpen(appIntent)) {
                externalOpened = true;
                lastError = null;
                Log.i(TAG, "external NetEase app opened");
                if (preparedPlaylist) {
                    NeteasePlaylistAutoplayService.requestPlaylistAutoplay();
                    if (floatingSourceWindow != null) {
                        floatingSourceWindow.show();
                    }
                }
                call.resolve();
                return;
            }

            Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(
                NETEASE_PACKAGE
            );
            if (launchIntent != null && tryOpen(launchIntent)) {
                externalOpened = true;
                lastError = "netease_deep_link_failed";
                Log.w(TAG, "NetEase app opened without playlist deep link");
                call.reject(
                    "NetEase app opened, but the playlist page could not be opened.",
                    "netease_deep_link_failed"
                );
                return;
            }

            lastError = "netease_app_open_failed";
            Log.w(TAG, lastError);
            call.reject("NetEase app could not be opened.", "netease_app_open_failed");
        });
    }

    private boolean tryOpen(Intent intent) {
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException error) {
            return false;
        }
    }

    private JSObject playbackState(String state) {
        JSObject result = new JSObject();
        result.put("state", state);
        result.put("currentTimeMs", 0);
        result.put("durationMs", 0);
        result.put("currentTrackId", currentTrackId);
        result.put("lastError", lastError);
        return result;
    }
}
