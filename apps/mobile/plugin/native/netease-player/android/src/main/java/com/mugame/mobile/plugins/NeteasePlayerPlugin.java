package com.mugame.mobile.plugins;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.util.Log;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NeteasePlayer")
public class NeteasePlayerPlugin extends Plugin {
    private static final String TAG = "MuGameNeteasePlayer";
    private static final String NETEASE_PACKAGE = "com.netease.cloudmusic";
    private static final String PLAYLIST_URL_PREFIX = "https://music.163.com/playlist?id=";
    private static final String SONG_URL_PREFIX = "https://music.163.com/song?id=";

    private String currentTrackId;
    private String preparedUrl;
    private boolean externalOpened;
    private String lastError;

    @PluginMethod
    public void initialize(PluginCall call) {
        Log.i(TAG, "android external player bridge initialized");
        call.resolve();
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
        prepareExternalUrl(SONG_URL_PREFIX + currentTrackId);
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
        prepareExternalUrl(PLAYLIST_URL_PREFIX + playlistId.trim());
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
        dispatchMediaKey(call, KeyEvent.KEYCODE_MEDIA_PAUSE);
    }

    @PluginMethod
    public void next(PluginCall call) {
        dispatchMediaKey(call, KeyEvent.KEYCODE_MEDIA_NEXT);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        dispatchMediaKey(call, KeyEvent.KEYCODE_MEDIA_PREVIOUS);
    }

    @PluginMethod
    public void seek(PluginCall call) {
        call.reject("Seek is not available when playback is handled by NetEase app.", "player_action_unsupported");
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
        externalOpened = false;
        lastError = null;
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
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (tryOpen(appIntent)) {
                externalOpened = true;
                lastError = null;
                Log.i(TAG, "external NetEase app opened");
                call.resolve();
                return;
            }
            openGenericUrl(call);
        });
    }

    private void openGenericUrl(PluginCall call) {
        Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(preparedUrl));
        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (tryOpen(fallbackIntent)) {
            externalOpened = true;
            lastError = null;
            Log.i(TAG, "external NetEase URL opened by generic intent");
            call.resolve();
            return;
        }
        lastError = "netease_app_open_failed";
        Log.w(TAG, lastError);
        call.reject("NetEase app could not be opened.", "netease_app_open_failed");
    }

    private boolean tryOpen(Intent intent) {
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException error) {
            return false;
        }
    }

    private void dispatchMediaKey(PluginCall call, int keyCode) {
        AudioManager audioManager =
            (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("Android media session is unavailable.", "media_session_unavailable");
            return;
        }
        long eventTime = System.currentTimeMillis();
        audioManager.dispatchMediaKeyEvent(
            new KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0)
        );
        audioManager.dispatchMediaKeyEvent(
            new KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0)
        );
        Log.i(TAG, "media key dispatched code=" + keyCode);
        call.resolve();
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
