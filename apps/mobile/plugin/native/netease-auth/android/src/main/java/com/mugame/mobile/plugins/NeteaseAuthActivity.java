package com.mugame.mobile.plugins;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.Message;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import java.lang.ref.WeakReference;

public class NeteaseAuthActivity extends Activity {
    public static final String EXTRA_LOGIN_URL = "login_url";
    private static final String DEFAULT_LOGIN_URL = NeteaseLoginWebViewSupport.LOGIN_URL;
    private static AuthListener listener;
    private static WeakReference<NeteaseAuthActivity> currentActivity;
    private boolean completed;

    interface AuthListener {
        void onCompleted();

        void onCancelled();

        void onFailed(String message);
    }

    static void setListener(AuthListener nextListener) {
        listener = nextListener;
    }

    static void clearListener() {
        listener = null;
    }

    static void closeIfOpen() {
        NeteaseAuthActivity activity =
            currentActivity == null ? null : currentActivity.get();
        if (activity != null) {
            activity.finish();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentActivity = new WeakReference<>(this);
        Log.i(NeteaseAuthPlugin.TAG, "login activity created");

        WebView webView = createLoginWebView();
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.addView(createCloseButton());
        layout.addView(NeteaseLoginMethodBar.create(this, webView));
        layout.addView(
            webView,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
            )
        );
        setContentView(layout);

        String loginUrl = getIntent().getStringExtra(EXTRA_LOGIN_URL);
        if (loginUrl == null || loginUrl.isEmpty()) {
            loginUrl = DEFAULT_LOGIN_URL;
        }

        Log.i(NeteaseAuthPlugin.TAG, "webview loading URL: " + sanitizeUrl(loginUrl));
        webView.loadUrl(loginUrl);
    }

    @Override
    protected void onDestroy() {
        if (!completed && listener != null) {
            Log.i(NeteaseAuthPlugin.TAG, "login cancelled");
            listener.onCancelled();
        }
        if (currentActivity != null && currentActivity.get() == this) {
            currentActivity = null;
        }
        super.onDestroy();
    }

    private Button createCloseButton() {
        Button closeButton = new Button(this);
        closeButton.setText("关闭网易云登录");
        closeButton.setMinHeight(48);
        closeButton.setOnClickListener(view -> finish());
        return closeButton;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createLoginWebView() {
        WebView webView = new WebView(this);
        NeteaseLoginWebViewSupport.configureLoginSettings(webView.getSettings());

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        installLoginChromeClient(webView);
        installLoginWebViewClient(webView);
        return webView;
    }

    private void installLoginChromeClient(WebView webView) {
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(
                WebView view,
                boolean isDialog,
                boolean isUserGesture,
                Message resultMsg
            ) {
                String url = view.getHitTestResult().getExtra();
                if (url != null && !url.isEmpty()) {
                    Log.i(NeteaseAuthPlugin.TAG, "login popup URL: " + sanitizeUrl(url));
                    view.loadUrl(url);
                    return false;
                }
                Log.w(NeteaseAuthPlugin.TAG, "login popup opened without direct URL");
                WebView popup = new WebView(view.getContext());
                NeteaseLoginWebViewSupport.configureLoginSettings(popup.getSettings());
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(
                        WebView popupView,
                        WebResourceRequest request
                    ) {
                        String popupUrl = request.getUrl().toString();
                        Log.i(
                            NeteaseAuthPlugin.TAG,
                            "login popup URL: " + sanitizeUrl(popupUrl)
                        );
                        view.loadUrl(popupUrl);
                        popupView.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport =
                    (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private void installLoginWebViewClient(WebView webView) {
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                if (
                    NeteaseLoginWebViewSupport.handleNonHttpLoginUrl(
                        NeteaseAuthActivity.this,
                        view,
                        request.getUrl()
                    )
                ) {
                    return true;
                }
                Log.i(
                    NeteaseAuthPlugin.TAG,
                    "webview loading URL: " + sanitizeUrl(request.getUrl().toString())
                );
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(NeteaseAuthPlugin.TAG, "page finished: " + sanitizeUrl(url));
                if (hasAuthCookie()) {
                    completed = true;
                    Log.i(NeteaseAuthPlugin.TAG, "login state detected");
                    if (listener != null) {
                        listener.onCompleted();
                    }
                    finish();
                }
            }

            @Override
            public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    Log.e(
                        NeteaseAuthPlugin.TAG,
                        "login page load failed: " + error.getDescription()
                    );
                    if (listener != null) {
                        listener.onFailed("NetEase login page failed to load.");
                    }
                }
            }
        });
    }

    private boolean hasAuthCookie() {
        CookieManager cookieManager = CookieManager.getInstance();
        String cookieHeader = cookieManager.getCookie("https://music.163.com");
        boolean authenticated =
            cookieHeader != null &&
            (cookieHeader.contains("MUSIC_U=") || cookieHeader.contains("MUSIC_A="));
        Log.i(
            NeteaseAuthPlugin.TAG,
            "login state checked in activity: authenticated=" + authenticated
        );
        return authenticated;
    }

    private String sanitizeUrl(String url) {
        int queryIndex = url.indexOf('?');
        int hashIndex = url.indexOf('#');
        int end = url.length();
        if (queryIndex >= 0) {
            end = Math.min(end, queryIndex);
        }
        if (hashIndex >= 0) {
            end = Math.min(end, hashIndex);
        }
        return url.substring(0, end);
    }
}
