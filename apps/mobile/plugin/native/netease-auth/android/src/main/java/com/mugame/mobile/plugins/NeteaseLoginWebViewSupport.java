package com.mugame.mobile.plugins;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.net.URISyntaxException;

final class NeteaseLoginWebViewSupport {
    static final String PHONE_LOGIN_URL = "https://music.163.com/m/login";
    static final String WECHAT_LOGIN_URL =
        "https://music.163.com/api/sns/authorize" +
        "?snsType=10&clientType=web2&callbackType=Login&forcelogin=true";
    static final String QQ_LOGIN_URL =
        "https://music.163.com/api/sns/authorize" +
        "?snsType=5&clientType=web2&callbackType=Login&forcelogin=true";
    static final String LOGIN_URL = PHONE_LOGIN_URL;

    private NeteaseLoginWebViewSupport() {}

    static void configureLoginSettings(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
    }

    static boolean handleNonHttpLoginUrl(Activity activity, WebView view, Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || isWebScheme(scheme)) {
            return false;
        }
        if ("intent".equals(scheme)) {
            return openIntentUrl(activity, view, uri.toString());
        }
        return openExternalLoginUrl(activity, uri);
    }

    private static boolean openIntentUrl(Activity activity, WebView view, String url) {
        try {
            Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            if (openExternalIntent(activity, intent)) {
                return true;
            }
            String fallbackUrl = intent.getStringExtra("browser_fallback_url");
            if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                Log.i(NeteaseAuthPlugin.TAG, "loading login intent fallback");
                view.loadUrl(fallbackUrl);
            }
        } catch (URISyntaxException error) {
            Log.w(NeteaseAuthPlugin.TAG, "invalid login intent URL");
        }
        return true;
    }

    private static boolean openExternalLoginUrl(Activity activity, Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        if (openExternalIntent(activity, intent)) {
            return true;
        }
        Log.w(
            NeteaseAuthPlugin.TAG,
            "no app available for login scheme: " + uri.getScheme()
        );
        return true;
    }

    private static boolean openExternalIntent(Activity activity, Intent intent) {
        try {
            activity.startActivity(intent);
            Log.i(NeteaseAuthPlugin.TAG, "external login intent opened");
            return true;
        } catch (ActivityNotFoundException error) {
            return false;
        }
    }

    private static boolean isWebScheme(String scheme) {
        return "http".equals(scheme) || "https".equals(scheme) || "about".equals(scheme);
    }
}
