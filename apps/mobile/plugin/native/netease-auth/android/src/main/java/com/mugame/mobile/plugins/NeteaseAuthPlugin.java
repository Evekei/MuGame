package com.mugame.mobile.plugins;

import android.content.Intent;
import android.util.Log;
import android.webkit.CookieManager;
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
    static final String TAG = "MuGameNeteaseAuth";
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

    private PluginCall pendingLoginCall;

    @PluginMethod
    public void openLogin(PluginCall call) {
        Log.i(TAG, "android plugin invoked: openLogin");
        getActivity().runOnUiThread(() -> startLoginActivity(call));
    }

    @PluginMethod
    public void closeLogin(PluginCall call) {
        Log.i(TAG, "android plugin invoked: closeLogin");
        getActivity().runOnUiThread(() -> {
            NeteaseAuthActivity.closeIfOpen();
            call.resolve();
        });
    }

    @PluginMethod
    public void readSession(PluginCall call) {
        Log.i(TAG, "android plugin invoked: readSession");
        JSONArray cookies = collectWhitelistedCookies();
        if (cookies.length() == 0) {
            Log.w(TAG, "readSession failed: no whitelisted cookies");
            call.reject("NetEase session is not available.", "session_unavailable");
            return;
        }

        JSObject result = new JSObject();
        result.put("cookies", cookies);
        result.put("captured_at", utcNow());
        Log.i(TAG, "readSession completed: cookie_count=" + cookies.length());
        call.resolve(result);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        Log.i(TAG, "android plugin invoked: clearSession");
        getActivity().runOnUiThread(() -> {
            NeteaseAuthActivity.closeIfOpen();
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.removeAllCookies(value -> {
                CookieManager.getInstance().flush();
                Log.i(TAG, "native webview session cleared");
                call.resolve();
            });
        });
    }

    private void startLoginActivity(PluginCall call) {
        if (pendingLoginCall != null) {
            Log.w(TAG, "login rejected: already open");
            call.reject("NetEase login is already open.", "login_already_open");
            return;
        }

        pendingLoginCall = call;
        NeteaseAuthActivity.setListener(new NeteaseAuthActivity.AuthListener() {
            @Override
            public void onCompleted() {
                resolvePendingLoginIfAuthenticated();
            }

            @Override
            public void onCancelled() {
                cancelPendingLogin("NetEase login cancelled.", "login_cancelled");
            }

            @Override
            public void onFailed(String message) {
                cancelPendingLogin(message, "login_failed");
            }
        });
        Intent intent = new Intent(getActivity(), NeteaseAuthActivity.class);
        intent.putExtra(
            NeteaseAuthActivity.EXTRA_LOGIN_URL,
            NeteaseLoginWebViewSupport.LOGIN_URL
        );
        Log.i(TAG, "starting login activity");
        getActivity().startActivity(intent);
    }

    private void resolvePendingLoginIfAuthenticated() {
        if (pendingLoginCall == null || !hasAuthCookie()) {
            Log.w(TAG, "login completed callback without auth cookie");
            return;
        }

        PluginCall call = pendingLoginCall;
        pendingLoginCall = null;
        NeteaseAuthActivity.clearListener();
        JSObject result = new JSObject();
        result.put("authenticated", true);
        Log.i(TAG, "login state detected: authenticated");
        call.resolve(result);
    }

    private void cancelPendingLogin(String message, String code) {
        if (pendingLoginCall != null) {
            PluginCall call = pendingLoginCall;
            pendingLoginCall = null;
            NeteaseAuthActivity.clearListener();
            Log.w(TAG, "login cancelled / failed: " + code);
            call.reject(message, code);
        }
    }

    private boolean hasAuthCookie() {
        Map<String, String> cookies = collectCookieMap();
        boolean authenticated =
            cookies.containsKey("MUSIC_U") || cookies.containsKey("MUSIC_A");
        Log.i(TAG, "login state checked: authenticated=" + authenticated);
        return authenticated;
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
