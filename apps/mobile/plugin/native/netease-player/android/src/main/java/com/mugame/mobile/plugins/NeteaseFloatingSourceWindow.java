package com.mugame.mobile.plugins;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class NeteaseFloatingSourceWindow {
    private static final int WIDTH_DP = 210;
    private static final int MAX_HEIGHT_DP = 150;
    private static final int BALL_SIZE_DP = 54;

    private final Context context;
    private final WindowManager windowManager;
    private final List<RevealTrack> tracks = new ArrayList<>();
    private View rootView;
    private View expandedView;
    private View ballView;
    private TextView statusText;
    private WindowManager.LayoutParams layoutParams;
    private boolean minimized;
    private float touchStartX;
    private float touchStartY;
    private int windowStartX;
    private int windowStartY;

    NeteaseFloatingSourceWindow(Context context) {
        this.context = context.getApplicationContext();
        this.windowManager = (WindowManager) this.context.getSystemService(Context.WINDOW_SERVICE);
    }

    boolean canShow() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    void updateTracks(JSONArray payload) {
        tracks.clear();
        if (payload == null) {
            return;
        }
        for (int index = 0; index < payload.length(); index++) {
            JSONObject item = payload.optJSONObject(index);
            if (item != null) {
                tracks.add(RevealTrack.fromJson(item));
            }
        }
    }

    boolean show() {
        if (!canShow() || windowManager == null) {
            return false;
        }
        if (rootView == null) {
            rootView = createView();
        }
        if (rootView.getParent() != null) {
            return true;
        }
        layoutParams = createLayoutParams();
        windowManager.addView(rootView, layoutParams);
        return true;
    }

    void hide() {
        if (rootView != null && rootView.getParent() != null && windowManager != null) {
            windowManager.removeView(rootView);
        }
    }

    private View createView() {
        FrameLayout root = new FrameLayout(context);
        root.setOnTouchListener(this::dragWindow);

        expandedView = createExpandedView();
        ballView = createBallView();
        root.addView(expandedView);
        root.addView(ballView, new FrameLayout.LayoutParams(dp(BALL_SIZE_DP), dp(BALL_SIZE_DP)));
        applyMinimized(false);
        return root;
    }

    private View createExpandedView() {
        LinearLayout container = new LinearLayout(context);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dp(10), dp(8), dp(10), dp(8));
        container.setBackground(roundedBackground(Color.argb(235, 20, 20, 24), dp(10)));

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button checkButton = new Button(context);
        checkButton.setText("Check");
        checkButton.setAllCaps(false);
        checkButton.setOnClickListener(_view -> revealCurrentSource());
        actions.addView(checkButton, new LinearLayout.LayoutParams(0, dp(42), 1));

        Button minimizeButton = new Button(context);
        minimizeButton.setText("-");
        minimizeButton.setAllCaps(false);
        minimizeButton.setOnClickListener(_view -> applyMinimized(true));
        actions.addView(minimizeButton, new LinearLayout.LayoutParams(dp(44), dp(42)));

        container.addView(actions, new LinearLayout.LayoutParams(-1, dp(42)));

        statusText = new TextView(context);
        statusText.setText("点击 Check 查看来源");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(13);
        statusText.setMaxLines(4);
        statusText.setPadding(0, dp(6), 0, 0);
        container.addView(statusText, new LinearLayout.LayoutParams(-1, -2));
        return container;
    }

    private View createBallView() {
        TextView ball = new TextView(context);
        ball.setText("MG");
        ball.setGravity(Gravity.CENTER);
        ball.setTextColor(Color.WHITE);
        ball.setTextSize(14);
        ball.setBackground(roundedBackground(Color.rgb(198, 38, 55), dp(BALL_SIZE_DP / 2)));
        ball.setOnClickListener(_view -> applyMinimized(false));
        return ball;
    }

    private GradientDrawable roundedBackground(int color, int radiusPx) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radiusPx);
        return drawable;
    }

    private WindowManager.LayoutParams createLayoutParams() {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            dp(WIDTH_DP),
            dp(MAX_HEIGHT_DP),
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.END;
        params.x = dp(12);
        params.y = dp(140);
        return params;
    }

    private void applyMinimized(boolean value) {
        minimized = value;
        if (expandedView != null) {
            expandedView.setVisibility(value ? View.GONE : View.VISIBLE);
        }
        if (ballView != null) {
            ballView.setVisibility(value ? View.VISIBLE : View.GONE);
        }
        if (layoutParams != null && rootView != null && rootView.getParent() != null) {
            layoutParams.width = dp(value ? BALL_SIZE_DP : WIDTH_DP);
            layoutParams.height = dp(value ? BALL_SIZE_DP : MAX_HEIGHT_DP);
            windowManager.updateViewLayout(rootView, layoutParams);
        }
    }

    private void revealCurrentSource() {
        NeteasePlaybackMetadataSnapshot metadata = NeteasePlaybackMonitorService.current(context);
        RevealTrack track = RevealTrackLocator.locate(tracks, metadata);
        if (track == null) {
            statusText.setText(missingTrackMessage(metadata));
            return;
        }
        statusText.setText(track.title + "\n来源：" + String.join(" / ", track.contributors));
    }

    private String missingTrackMessage(NeteasePlaybackMetadataSnapshot metadata) {
        if ("permission_required".equals(metadata.status)) {
            return "需要开启通知监听权限\n回 MuGame 点权限按钮";
        }
        if (!"ready".equals(metadata.status)) {
            return "未读取到网易云播放\n请确认网易云正在播放";
        }
        String title = safe(metadata.title);
        String artist = safe(metadata.artist);
        if (title.isEmpty() && artist.isEmpty()) {
            return "网易云未返回歌曲信息\n请稍等后再 Check";
        }
        return "未匹配到当前歌曲\n" + title + " - " + artist;
    }

    private boolean dragWindow(View view, MotionEvent event) {
        if (layoutParams == null || windowManager == null) {
            return false;
        }
        boolean wasTap = false;
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                touchStartX = event.getRawX();
                touchStartY = event.getRawY();
                windowStartX = layoutParams.x;
                windowStartY = layoutParams.y;
                return false;
            case MotionEvent.ACTION_MOVE:
                layoutParams.x = windowStartX - (int) (event.getRawX() - touchStartX);
                layoutParams.y = windowStartY + (int) (event.getRawY() - touchStartY);
                windowManager.updateViewLayout(rootView, layoutParams);
                return true;
            case MotionEvent.ACTION_UP:
                wasTap =
                    Math.abs(event.getRawX() - touchStartX) < dp(6) &&
                    Math.abs(event.getRawY() - touchStartY) < dp(6);
                if (minimized && wasTap) {
                    applyMinimized(false);
                    return true;
                }
                return false;
            default:
                return false;
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
