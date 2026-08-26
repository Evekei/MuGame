package com.mugame.mobile.plugins;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.Arrays;
import java.util.List;

public class NeteasePlaylistAutoplayService extends AccessibilityService {
    private static final String TAG = "MuGamePlaylistAutoplay";
    private static final long REQUEST_WINDOW_MS = 8000;
    private static final long NOW_PLAYING_WINDOW_MS = 5000;
    private static final long NOW_PLAYING_RETRY_MS = 250;
    private static final List<String> PLAY_TEXTS = Arrays.asList(
        "播放全部",
        "播放",
        "继续播放"
    );
    private static final List<String> MINI_PLAYER_IDS = Arrays.asList(
        "com.netease.cloudmusic:id/miniPlayBarReallyRoot",
        "com.netease.cloudmusic:id/minibarContentContainerNew",
        "com.netease.cloudmusic:id/minPlayerBarContainer",
        "com.netease.cloudmusic:id/minPlayerBar"
    );

    private static volatile long requestedUntilMs = 0;
    private static volatile boolean requestHandled = false;
    private static volatile boolean nowPlayingRequested = false;
    private static volatile long nowPlayingUntilMs = 0;

    private final Handler handler = new Handler(Looper.getMainLooper());

    static void requestPlaylistAutoplay() {
        requestedUntilMs = System.currentTimeMillis() + REQUEST_WINDOW_MS;
        requestHandled = false;
        nowPlayingRequested = false;
        nowPlayingUntilMs = 0;
        Log.i(TAG, "playlist autoplay requested");
    }

    static boolean isEnabled(Context context) {
        String enabledServices = Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (enabledServices == null) {
            return false;
        }

        String expected = new ComponentName(
            context,
            NeteasePlaylistAutoplayService.class
        ).flattenToString();
        return enabledServices.toLowerCase().contains(expected.toLowerCase());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!NeteasePlaybackMonitorService.NETEASE_PACKAGE.equals(event.getPackageName())) {
            return;
        }

        if (nowPlayingRequested) {
            if (isPlayerActivity(event) || System.currentTimeMillis() > nowPlayingUntilMs) {
                nowPlayingRequested = false;
                return;
            }
            tryOpenNowPlaying();
            return;
        }

        if (requestHandled || System.currentTimeMillis() > requestedUntilMs) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return;
        }

        try {
            if (clickPlaylistPlayButton(root)) {
                requestHandled = true;
                requestedUntilMs = 0;
                Log.i(TAG, "playlist play button clicked");
                requestNowPlayingOpen();
            }
        } finally {
            root.recycle();
        }
    }

    @Override
    public void onInterrupt() {
        requestHandled = true;
        nowPlayingRequested = false;
        nowPlayingUntilMs = 0;
    }

    private boolean clickPlaylistPlayButton(AccessibilityNodeInfo root) {
        for (String text : PLAY_TEXTS) {
            if (clickFirstTextMatch(root, text)) {
                return true;
            }
        }
        return false;
    }

    private boolean clickFirstTextMatch(AccessibilityNodeInfo root, String text) {
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
        for (AccessibilityNodeInfo node : nodes) {
            try {
                if (isExactTextMatch(node, text) && clickNodeOrAncestor(node)) {
                    return true;
                }
            } finally {
                node.recycle();
            }
        }
        return false;
    }

    private boolean isExactTextMatch(AccessibilityNodeInfo node, String expected) {
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        return expected.contentEquals(text == null ? "" : text)
            || expected.contentEquals(description == null ? "" : description);
    }

    private boolean clickNodeOrAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = AccessibilityNodeInfo.obtain(node);
        try {
            while (current != null) {
                if (current.isClickable() && current.isEnabled()) {
                    return current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                }
                AccessibilityNodeInfo parent = current.getParent();
                current.recycle();
                current = parent;
            }
            return false;
        } finally {
            if (current != null) {
                current.recycle();
            }
        }
    }

    private void requestNowPlayingOpen() {
        nowPlayingRequested = true;
        nowPlayingUntilMs = System.currentTimeMillis() + NOW_PLAYING_WINDOW_MS;
        Log.i(TAG, "now playing open requested");
        tryOpenNowPlaying();
    }

    private void tryOpenNowPlaying() {
        if (!nowPlayingRequested || System.currentTimeMillis() > nowPlayingUntilMs) {
            nowPlayingRequested = false;
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        try {
            if (root != null && !clickBottomNowPlayingNode(root)) {
                tapBottomNowPlayingArea(root);
            }
        } finally {
            if (root != null) {
                root.recycle();
            }
        }

        handler.postDelayed(this::tryOpenNowPlaying, NOW_PLAYING_RETRY_MS);
    }

    private boolean isPlayerActivity(AccessibilityEvent event) {
        CharSequence className = event.getClassName();
        return className != null && className.toString().contains("PlayerActivity");
    }

    private boolean clickBottomNowPlayingNode(AccessibilityNodeInfo root) {
        if (clickMiniPlayerByResourceId(root)) {
            return true;
        }

        Rect rootBounds = new Rect();
        root.getBoundsInScreen(rootBounds);
        AccessibilityNodeInfo candidate = findBottomWideClickable(root, rootBounds);
        if (candidate == null) {
            return false;
        }
        try {
            return candidate.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        } finally {
            candidate.recycle();
        }
    }

    private boolean clickMiniPlayerByResourceId(AccessibilityNodeInfo root) {
        for (String viewId : MINI_PLAYER_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(viewId);
            for (AccessibilityNodeInfo node : nodes) {
                try {
                    if (clickNodeOrAncestor(node)) {
                        Log.i(TAG, "mini player clicked by view id " + viewId);
                        return true;
                    }
                } finally {
                    node.recycle();
                }
            }
        }
        return false;
    }

    private AccessibilityNodeInfo findBottomWideClickable(
        AccessibilityNodeInfo node,
        Rect rootBounds
    ) {
        AccessibilityNodeInfo best = null;
        Rect bestBounds = new Rect();
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);

        if (isBottomNowPlayingCandidate(node, bounds, rootBounds)) {
            best = AccessibilityNodeInfo.obtain(node);
            bestBounds.set(bounds);
        }

        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child == null) {
                continue;
            }
            AccessibilityNodeInfo childCandidate = findBottomWideClickable(child, rootBounds);
            child.recycle();
            if (childCandidate == null) {
                continue;
            }
            childCandidate.getBoundsInScreen(bounds);
            if (best == null || bounds.bottom > bestBounds.bottom) {
                if (best != null) {
                    best.recycle();
                }
                best = childCandidate;
                bestBounds.set(bounds);
            } else {
                childCandidate.recycle();
            }
        }
        return best;
    }

    private boolean isBottomNowPlayingCandidate(
        AccessibilityNodeInfo node,
        Rect bounds,
        Rect rootBounds
    ) {
        int rootWidth = rootBounds.width();
        int rootHeight = rootBounds.height();
        return node.isClickable()
            && node.isEnabled()
            && bounds.width() >= rootWidth * 0.45
            && bounds.height() >= 36
            && bounds.top >= rootBounds.top + (int) (rootHeight * 0.65)
            && !isPlayControlText(node);
    }

    private boolean isPlayControlText(AccessibilityNodeInfo node) {
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        for (String playText : PLAY_TEXTS) {
            if (playText.contentEquals(text == null ? "" : text)
                || playText.contentEquals(description == null ? "" : description)) {
                return true;
            }
        }
        return false;
    }

    private boolean tapBottomNowPlayingArea(AccessibilityNodeInfo root) {
        Rect bounds = new Rect();
        root.getBoundsInScreen(bounds);
        int x = bounds.left + bounds.width() / 2;
        int y = bounds.top + (int) (bounds.height() * 0.86);
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, 60))
            .build();
        return dispatchGesture(gesture, null, null);
    }
}
