package com.mugame.mobile.plugins;

import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NeteasePlayer")
public class NeteasePlayerPlugin extends Plugin {
    private static final String TAG = "MuGameNeteasePlayer";
    private static final String PLAYER_URL_PREFIX = "https://music.163.com/m/song?id=";
    private static final String AUDIO_SELECTOR = "audio";
    private static final String SELECTOR_VERSION = "netease-mobile-song-audio-v1";

    private WebView webView;
    private String currentTrackId;
    private String lastError;
    private PluginCall pendingLoadCall;

    @PluginMethod
    public void initialize(PluginCall call) {
        Log.i(TAG, "android player bridge invoked: initialize");
        getActivity().runOnUiThread(() -> {
            ensureWebView();
            call.resolve();
        });
    }

    @PluginMethod
    public void ensureLoggedIn(PluginCall call) {
        boolean loggedIn = hasAuthCookie();
        Log.i(TAG, "player login state checked: loggedIn=" + loggedIn);
        if (!loggedIn) {
            call.reject("NetEase session is expired.", "netease_session_expired");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void loadTrack(PluginCall call) {
        String songId = call.getString("netease_song_id");
        if (songId == null || songId.trim().isEmpty()) {
            call.reject("netease_song_id is required.", "invalid_track_id");
            return;
        }
        getActivity().runOnUiThread(() -> {
            ensureWebView();
            currentTrackId = songId;
            lastError = null;
            String url = PLAYER_URL_PREFIX + songId;
            Log.i(TAG, "webview loading player URL: " + url);
            pendingLoadCall = call;
            webView.loadUrl(url);
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        runPlayerAction(call, actionScript("play"));
    }

    @PluginMethod
    public void pause(PluginCall call) {
        runPlayerAction(call, actionScript("pause"));
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Integer ms = call.getInt("ms");
        if (ms == null || ms < 0) {
            call.reject("seek ms must be a non-negative integer.", "invalid_seek");
            return;
        }
        runPlayerAction(call, seekScript(ms));
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (webView == null) {
                call.resolve(playbackState("idle", 0, 0));
                return;
            }
            webView.evaluateJavascript(stateScript(), value -> call.resolve(parseState(value)));
        });
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        Log.i(TAG, "android player bridge invoked: destroy");
        getActivity().runOnUiThread(() -> {
            if (webView != null) {
                ViewGroup parent = (ViewGroup) webView.getParent();
                if (parent != null) {
                    parent.removeView(webView);
                }
                webView.destroy();
                webView = null;
            }
            currentTrackId = null;
            lastError = null;
            pendingLoadCall = null;
            call.resolve();
        });
    }

    private void ensureWebView() {
        if (webView != null) {
            return;
        }
        Log.i(TAG, "netease player webview created");
        webView = new WebView(getContext());
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new PlayerWebViewClient());
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1);
        params.leftMargin = -10;
        params.topMargin = -10;
        getActivity().addContentView(webView, params);
    }

    private void runPlayerAction(PluginCall call, String script) {
        getActivity().runOnUiThread(() -> {
            if (webView == null) {
                rejectUnsupported(call, "player_not_initialized");
                return;
            }
            webView.evaluateJavascript(script, value -> {
                JSObject result = parseActionResult(value);
                if (!result.getBool("ok")) {
                    String error = result.getString("error", "player_action_failed");
                    rejectUnsupported(call, error);
                    return;
                }
                call.resolve();
            });
        });
    }
    private void rejectUnsupported(PluginCall call, String reason) {
        lastError = reason + " selector=" + AUDIO_SELECTOR + " version=" + SELECTOR_VERSION;
        Log.w(TAG, "player action unsupported: " + lastError);
        call.reject(lastError, "player_action_unsupported");
    }
    private boolean hasAuthCookie() {
        CookieManager manager = CookieManager.getInstance();
        String cookies = manager.getCookie("https://music.163.com");
        return cookies != null && (cookies.contains("MUSIC_U=") || cookies.contains("MUSIC_A="));
    }
    private JSObject playbackState(String state, int currentMs, int durationMs) {
        JSObject result = new JSObject();
        result.put("state", state);
        result.put("currentTimeMs", currentMs);
        result.put("durationMs", durationMs);
        result.put("currentTrackId", currentTrackId);
        result.put("lastError", lastError);
        return result;
    }
    private JSObject parseState(String value) {
        try {
            JSONObject json = new JSONObject(unwrap(value));
            JSObject result = playbackState(
                json.optString("state", "error"),
                json.optInt("currentTimeMs", 0),
                json.optInt("durationMs", 0)
            );
            result.put("lastError", json.optString("lastError", lastError));
            return result;
        } catch (JSONException error) {
            lastError = "state_parse_failed selector=" + AUDIO_SELECTOR;
            return playbackState("error", 0, 0);
        }
    }
    private JSObject parseActionResult(String value) {
        JSObject result = new JSObject();
        try {
            JSONObject json = new JSONObject(unwrap(value));
            result.put("ok", json.optBoolean("ok", false));
            result.put("error", json.optString("error", ""));
        } catch (JSONException error) {
            result.put("ok", false);
            result.put("error", "action_result_parse_failed");
        }
        return result;
    }
    private String unwrap(String value) {
        if (value == null || value.equals("null")) {
            return "{}";
        }
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1).replace("\\\"", "\"");
        }
        return value;
    }
    private String actionScript(String action) {
        return "(function(){var a=document.querySelector('" + AUDIO_SELECTOR + "');"
            + "if(!a){return JSON.stringify({ok:false,error:'audio_element_not_found'});}"
            + "try{a." + action + "();return JSON.stringify({ok:true});}"
            + "catch(e){return JSON.stringify({ok:false,error:String(e.message||e)});}})();";
    }
    private String seekScript(int ms) {
        return "(function(){var a=document.querySelector('" + AUDIO_SELECTOR + "');"
            + "if(!a){return JSON.stringify({ok:false,error:'audio_element_not_found'});}"
            + "a.currentTime=" + (ms / 1000.0) + ";return JSON.stringify({ok:true});})();";
    }
    private String stateScript() {
        return "(function(){var a=document.querySelector('" + AUDIO_SELECTOR + "');"
            + "if(!a){return JSON.stringify({state:'error',currentTimeMs:0,durationMs:0,"
            + "lastError:'audio_element_not_found selector=" + AUDIO_SELECTOR
            + " version=" + SELECTOR_VERSION + "'});}"
            + "var d=isFinite(a.duration)?Math.round(a.duration*1000):0;"
            + "var c=isFinite(a.currentTime)?Math.round(a.currentTime*1000):0;"
            + "var s=a.ended?'ended':(a.paused?'paused':'playing');"
            + "return JSON.stringify({state:s,currentTimeMs:c,durationMs:d,lastError:null});})();";
    }
    private class PlayerWebViewClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            Log.i(TAG, "player page finished selectorVersion=" + SELECTOR_VERSION);
            if (pendingLoadCall != null) {
                PluginCall call = pendingLoadCall;
                pendingLoadCall = null;
                call.resolve();
            }
        }

        @Override
        public void onReceivedError(
            WebView view,
            WebResourceRequest request,
            WebResourceError error
        ) {
            if (!request.isForMainFrame()) {
                return;
            }
            lastError = "player_load_failed selectorVersion=" + SELECTOR_VERSION
                + " code=" + error.getErrorCode();
            Log.w(TAG, lastError);
            if (pendingLoadCall != null) {
                PluginCall call = pendingLoadCall;
                pendingLoadCall = null;
                call.reject(lastError, "player_load_failed");
            }
        }
    }
}
