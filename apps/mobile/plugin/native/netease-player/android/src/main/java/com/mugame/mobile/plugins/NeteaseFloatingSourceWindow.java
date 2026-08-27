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
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class NeteaseFloatingSourceWindow {
    private static final int WIDTH_DP = 156;
    private static final int MAX_HEIGHT_DP = 216;
    private static final int BALL_SIZE_DP = 54;

    private final Context context;
    private final WindowManager windowManager;
    private final List<RevealTrack> tracks = new ArrayList<>();
    private String analyticsText = "统计暂无数据\n完成导入后会显示结果";
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
    private boolean touchMoved;

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

    void updateAnalytics(JSONObject payload) {
        if (payload == null) {
            analyticsText = "统计暂无数据\n完成导入后会显示结果";
            return;
        }
        JSONArray lines = payload.optJSONArray("lines");
        if (lines == null || lines.length() == 0) {
            analyticsText = "统计正在分析\n稍后再点统计";
            return;
        }
        List<String> displayLines = new ArrayList<>();
        int maxLines = Math.min(lines.length(), 5);
        for (int index = 0; index < maxLines; index++) {
            String line = safe(lines.optString(index));
            if (!line.isEmpty()) {
                displayLines.add(line);
            }
        }
        analyticsText = displayLines.isEmpty()
            ? "统计正在分析\n稍后再点统计"
            : String.join("\n", displayLines);
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
        container.setPadding(dp(8), dp(8), dp(8), dp(8));
        container.setBackground(roundedBackground(Color.argb(235, 20, 20, 24), dp(10)));

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.VERTICAL);

        Button checkButton = new Button(context);
        checkButton.setText("Check");
        checkButton.setAllCaps(false);
        styleCompactButton(checkButton);
        checkButton.setOnClickListener(_view -> revealCurrentSource());
        actions.addView(checkButton, new LinearLayout.LayoutParams(-1, dp(34)));

        Button statsButton = new Button(context);
        statsButton.setText("统计");
        statsButton.setAllCaps(false);
        styleCompactButton(statsButton);
        statsButton.setOnClickListener(_view -> showAnalytics());
        LinearLayout.LayoutParams statsParams = new LinearLayout.LayoutParams(-1, dp(34));
        statsParams.topMargin = dp(4);
        actions.addView(statsButton, statsParams);

        container.addView(actions, new LinearLayout.LayoutParams(-1, -2));

        statusText = new TextView(context);
        statusText.setText("点击 Check 查看来源");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(12);
        statusText.setMaxLines(5);
        statusText.setPadding(0, dp(4), 0, 0);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, 0, 1);
        statusParams.topMargin = dp(4);
        container.addView(statusText, statusParams);

        Button minimizeButton = new Button(context);
        minimizeButton.setText("最小化");
        minimizeButton.setAllCaps(false);
        styleCompactButton(minimizeButton);
        minimizeButton.setOnClickListener(_view -> applyMinimized(true));
        LinearLayout.LayoutParams minimizeParams = new LinearLayout.LayoutParams(-1, dp(28));
        minimizeParams.topMargin = dp(4);
        container.addView(minimizeButton, minimizeParams);
        return container;
    }

    private void styleCompactButton(Button button) {
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(0, 0, 0, 0);
    }

    private View createBallView() {
        ImageView ball = new ImageView(context);
        ball.setImageResource(appIconResource());
        ball.setScaleType(ImageView.ScaleType.CENTER_CROP);
        ball.setBackgroundColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ball.setClipToOutline(true);
            ball.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            ball.setBackground(roundedBackground(Color.TRANSPARENT, dp(BALL_SIZE_DP / 2)));
        }
        ball.setOnTouchListener(this::dragWindow);
        return ball;
    }

    private int appIconResource() {
        int roundIcon = context.getResources().getIdentifier(
            "ic_launcher_round",
            "mipmap",
            context.getPackageName()
        );
        return roundIcon != 0 ? roundIcon : context.getApplicationInfo().icon;
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

    private void showAnalytics() {
        statusText.setText(analyticsText);
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
                touchMoved = false;
                return minimized;
            case MotionEvent.ACTION_MOVE:
                if (
                    Math.abs(event.getRawX() - touchStartX) < dp(6) &&
                    Math.abs(event.getRawY() - touchStartY) < dp(6)
                ) {
                    return minimized;
                }
                touchMoved = true;
                layoutParams.x = windowStartX - (int) (event.getRawX() - touchStartX);
                layoutParams.y = windowStartY + (int) (event.getRawY() - touchStartY);
                windowManager.updateViewLayout(rootView, layoutParams);
                return true;
            case MotionEvent.ACTION_UP:
                wasTap =
                    !touchMoved &&
                    Math.abs(event.getRawX() - touchStartX) < dp(6) &&
                    Math.abs(event.getRawY() - touchStartY) < dp(6);
                if (minimized && wasTap) {
                    applyMinimized(false);
                    return true;
                }
                return minimized;
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
