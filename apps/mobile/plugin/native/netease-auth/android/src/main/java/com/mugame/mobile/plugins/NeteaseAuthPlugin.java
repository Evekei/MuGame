package com.mugame.mobile.plugins;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.graphics.Color;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NeteaseAuth")
public class NeteaseAuthPlugin extends Plugin {
    private static final String LOGIN_URL = "https://music.163.com/";
    private static final String[] COOKIE_URLS = {
        "https://music.163.com",
        "https://m.music.163.com",
        "https://interface.music.163.com"
    };
    private static final String[] ALLOWED_COOKIE_NAMES = {
        "MUSIC_U",
        "MUSIC_A",
        "MUSIC_R_T",
        "MUSIC_R_I",
        "__csrf",
        "NMTID"
    };

    private Dialog loginDialog;
    private PluginCall pendingLoginCall;

    @PluginMethod
    public void openLogin(PluginCall call) {
        getActivity().runOnUiThread(() -> showLoginDialog(call));
    }

    @PluginMethod
    public void closeLogin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            closeLoginDialog(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void readSession(PluginCall call) {
        JSONArray cookies = collectWhitelistedCookies();
        if (cookies.length() == 0) {
            call.reject("NetEase session is not available.", "session_unavailable");
            return;
        }

        JSObject result = new JSObject();
        result.put("cookies", cookies);
        result.put("captured_at", utcNow());
        call.resolve(result);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            closeLoginDialog(false);
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.removeAllCookies(value -> {
                CookieManager.getInstance().flush();
                call.resolve();
            });
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showLoginDialog(PluginCall call) {
        if (pendingLoginCall != null) {
            call.reject("NetEase login is already open.", "login_already_open");
            return;
        }

        pendingLoginCall = call;
        loginDialog = new Dialog(getActivity());

        LinearLayout layout = new LinearLayout(getActivity());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.WHITE);

        Button closeButton = new Button(getActivity());
        closeButton.setText("Close");
        closeButton.setOnClickListener(view -> cancelPendingLogin());
        layout.addView(
            closeButton,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );

        WebView webView = new WebView(getActivity());
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                resolvePendingLoginIfAuthenticated();
            }
        });

        layout.addView(
            webView,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
            )
        );

        loginDialog.setContentView(layout);
        loginDialog.setOnCancelListener(dialog -> cancelPendingLogin());
        loginDialog.show();

        webView.loadUrl(LOGIN_URL);
    }

    private void resolvePendingLoginIfAuthenticated() {
        if (pendingLoginCall == null || !hasAuthCookie()) {
            return;
        }

        PluginCall call = pendingLoginCall;
        pendingLoginCall = null;
        JSObject result = new JSObject();
        result.put("authenticated", true);
        call.resolve(result);
        closeLoginDialog(false);
    }

    private void cancelPendingLogin() {
        if (pendingLoginCall != null) {
            PluginCall call = pendingLoginCall;
            pendingLoginCall = null;
            call.reject("NetEase login cancelled.", "login_cancelled");
        }
        closeLoginDialog(false);
    }

    private void closeLoginDialog(boolean rejectPending) {
        if (rejectPending && pendingLoginCall != null) {
            pendingLoginCall.reject("NetEase login closed.", "login_cancelled");
            pendingLoginCall = null;
        }

        if (loginDialog != null) {
            loginDialog.dismiss();
            loginDialog = null;
        }
    }

    private boolean hasAuthCookie() {
        Map<String, String> cookies = collectCookieMap();
        return cookies.containsKey("MUSIC_U") || cookies.containsKey("MUSIC_A");
    }

    private JSONArray collectWhitelistedCookies() {
        JSONArray result = new JSONArray();
        Map<String, String> cookies = collectCookieMap();
        for (String allowedName : ALLOWED_COOKIE_NAMES) {
            if (!cookies.containsKey(allowedName)) {
                continue;
            }

            JSONObject cookie = new JSONObject();
            try {
                cookie.put("name", allowedName);
                cookie.put("value", cookies.get(allowedName));
                cookie.put("domain", ".music.163.com");
                cookie.put("path", "/");
                result.put(cookie);
            } catch (JSONException error) {
                throw new IllegalStateException("Failed to build cookie snapshot.", error);
            }
        }
        return result;
    }

    private Map<String, String> collectCookieMap() {
        Map<String, String> result = new LinkedHashMap<>();
        CookieManager cookieManager = CookieManager.getInstance();

        for (String url : COOKIE_URLS) {
            String cookieHeader = cookieManager.getCookie(url);
            if (cookieHeader == null || cookieHeader.isEmpty()) {
                continue;
            }

            String[] parts = cookieHeader.split(";");
            for (String part : parts) {
                String[] pair = part.trim().split("=", 2);
                if (pair.length == 2 && pair[0].length() > 0 && pair[1].length() > 0) {
                    result.put(pair[0], pair[1]);
                }
            }
        }

        return result;
    }

    private String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            Locale.US
        );
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
