package com.mugame.mobile.plugins;

import android.content.ComponentName;
import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

public class NeteasePlaybackMonitorService extends NotificationListenerService {
    static final String NETEASE_PACKAGE = "com.netease.cloudmusic";

    interface MetadataListener {
        void onMetadataChanged(NeteasePlaybackMetadataSnapshot snapshot);
    }

    private static final Set<MetadataListener> LISTENERS = new CopyOnWriteArraySet<>();
    private static volatile NeteasePlaybackMetadataSnapshot latest =
        NeteasePlaybackMetadataSnapshot.notPlaying();

    static void addListener(MetadataListener listener) {
        LISTENERS.add(listener);
    }

    static void removeListener(MetadataListener listener) {
        LISTENERS.remove(listener);
    }

    static NeteasePlaybackMetadataSnapshot current(Context context) {
        if (!isEnabled(context)) {
            return publish(NeteasePlaybackMetadataSnapshot.permissionRequired());
        }

        try {
            MediaSessionManager manager =
                (MediaSessionManager) context.getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (manager == null) {
                return publish(NeteasePlaybackMetadataSnapshot.notPlaying());
            }
            ComponentName component = new ComponentName(
                context,
                NeteasePlaybackMonitorService.class
            );
            return publish(readNeteaseSession(manager.getActiveSessions(component)));
        } catch (SecurityException error) {
            return publish(NeteasePlaybackMetadataSnapshot.permissionRequired());
        }
    }

    static boolean isEnabled(Context context) {
        String enabledListeners = Settings.Secure.getString(
            context.getContentResolver(),
            "enabled_notification_listeners"
        );
        if (enabledListeners == null) {
            return false;
        }
        return enabledListeners.toLowerCase().contains(context.getPackageName().toLowerCase());
    }

    @Override
    public void onListenerConnected() {
        current(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        if (NETEASE_PACKAGE.equals(notification.getPackageName())) {
            current(this);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification notification) {
        if (NETEASE_PACKAGE.equals(notification.getPackageName())) {
            current(this);
        }
    }

    private static NeteasePlaybackMetadataSnapshot readNeteaseSession(
        List<MediaController> controllers
    ) {
        for (MediaController controller : controllers) {
            if (!NETEASE_PACKAGE.equals(controller.getPackageName())) {
                continue;
            }
            MediaMetadata metadata = controller.getMetadata();
            if (metadata == null) {
                continue;
            }
            return fromController(controller, metadata);
        }
        return NeteasePlaybackMetadataSnapshot.notPlaying();
    }

    private static NeteasePlaybackMetadataSnapshot fromController(
        MediaController controller,
        MediaMetadata metadata
    ) {
        return new NeteasePlaybackMetadataSnapshot(
            "ready",
            controller.getPackageName(),
            metadata.getString(MediaMetadata.METADATA_KEY_TITLE),
            metadata.getString(MediaMetadata.METADATA_KEY_ARTIST),
            metadata.getString(MediaMetadata.METADATA_KEY_ALBUM),
            duration(metadata),
            metadata.getString(MediaMetadata.METADATA_KEY_MEDIA_ID),
            playbackState(controller.getPlaybackState()),
            System.currentTimeMillis()
        );
    }

    private static Long duration(MediaMetadata metadata) {
        long value = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
        return value > 0 ? value : null;
    }

    private static String playbackState(PlaybackState state) {
        if (state == null) {
            return null;
        }
        switch (state.getState()) {
            case PlaybackState.STATE_PLAYING:
                return "playing";
            case PlaybackState.STATE_PAUSED:
                return "paused";
            case PlaybackState.STATE_STOPPED:
                return "stopped";
            case PlaybackState.STATE_BUFFERING:
                return "buffering";
            default:
                return "unknown";
        }
    }

    private static NeteasePlaybackMetadataSnapshot publish(
        NeteasePlaybackMetadataSnapshot snapshot
    ) {
        latest = snapshot;
        for (MetadataListener listener : LISTENERS) {
            listener.onMetadataChanged(snapshot);
        }
        return latest;
    }
}
