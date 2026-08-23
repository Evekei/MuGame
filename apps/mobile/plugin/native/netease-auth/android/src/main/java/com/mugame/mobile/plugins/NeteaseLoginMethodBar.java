package com.mugame.mobile.plugins;

import android.app.Activity;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;

final class NeteaseLoginMethodBar {
    private NeteaseLoginMethodBar() {}

    static LinearLayout create(Activity activity, WebView webView) {
        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.addView(
            methodButton(activity, webView, "手机号", NeteaseLoginWebViewSupport.PHONE_LOGIN_URL)
        );
        bar.addView(
            methodButton(activity, webView, "微信扫码", NeteaseLoginWebViewSupport.WECHAT_LOGIN_URL)
        );
        bar.addView(
            methodButton(activity, webView, "QQ", NeteaseLoginWebViewSupport.QQ_LOGIN_URL)
        );
        return bar;
    }

    private static Button methodButton(
        Activity activity,
        WebView webView,
        String label,
        String url
    ) {
        Button button = new Button(activity);
        button.setText(label);
        button.setMinHeight(48);
        button.setOnClickListener(view -> {
            Log.i(NeteaseAuthPlugin.TAG, "login method selected: " + label);
            webView.loadUrl(url);
        });
        button.setLayoutParams(
            new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1
            )
        );
        return button;
    }
}
