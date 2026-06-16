package com.spendwithpip.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String TAG = "PipNativeShell";
    private static final String PIP_HOST = "spendwithpip.com";
    private static final String LAUNCH_URL = "https://spendwithpip.com/app";
    private static final String USER_AGENT_SUFFIX = " PipAndroid/1";

    private WebView webView;
    private FrameLayout root;
    private String currentAllowedUrl = LAUNCH_URL;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        setupWebView();
        routeIntent(getIntent(), true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeIntent(intent, false);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        moveTaskToBack(true);
    }

    private void configureWindow() {
        getWindow().setStatusBarColor(getColor(R.color.pip_background));
        getWindow().setNavigationBarColor(getColor(R.color.pip_background));
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.pip_background));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(getColor(R.color.pip_background));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + USER_AGENT_SUFFIX);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new PipWebViewClient());

        root.addView(webView);
        setContentView(root);
    }

    private void routeIntent(Intent intent, boolean initialLaunch) {
        Uri data = intent != null ? intent.getData() : null;
        String url = LAUNCH_URL;

        if (data != null && isAllowedPipUri(data)) {
            url = data.toString();
            Log.i(TAG, "callbackIntent url=" + safeUrlForLog(url));
        } else if (data != null) {
            Log.w(TAG, "navigationBlocked host=" + safeHostForLog(data));
        }

        if (initialLaunch) {
            Log.i(TAG, "launchUrl=" + LAUNCH_URL);
        }

        loadPipUrl(url);
    }

    private void loadPipUrl(String url) {
        currentAllowedUrl = url;
        if (!hasNetworkConnection()) {
            showNativeError("Pip needs a connection", "Check your internet connection, then reopen Pip.");
            Log.w(TAG, "offline url=" + safeUrlForLog(url));
            return;
        }

        Log.i(TAG, "navigationAllowed host=" + PIP_HOST + " path=" + safePathForLog(Uri.parse(url)));
        webView.loadUrl(url);
    }

    private boolean hasNetworkConnection() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) {
            return true;
        }
        NetworkInfo networkInfo = manager.getActiveNetworkInfo();
        return networkInfo != null && networkInfo.isConnected();
    }

    private boolean isAllowedPipUri(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && PIP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private boolean shouldOpenExternally(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) {
            return false;
        }

        if ("mailto".equalsIgnoreCase(scheme)
            || "tel".equalsIgnoreCase(scheme)
            || "sms".equalsIgnoreCase(scheme)
            || "market".equalsIgnoreCase(scheme)) {
            return true;
        }

        return "https".equalsIgnoreCase(scheme) && !PIP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void openExternal(Uri uri) {
        Log.i(TAG, "navigationExternal host=" + safeHostForLog(uri));
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Log.w(TAG, "navigationBlocked host=" + safeHostForLog(uri));
            showNativeError("Pip cannot open this link", "This link needs another app that is not available.");
        }
    }

    private void showNativeError(String title, String body) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(48, 48, 48, 48);
        panel.setBackgroundResource(R.drawable.native_error_background);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.rgb(17, 17, 17));
        titleView.setTextSize(22);
        titleView.setGravity(Gravity.CENTER);

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextColor(Color.rgb(17, 17, 17));
        bodyView.setTextSize(16);
        bodyView.setGravity(Gravity.CENTER);
        bodyView.setPadding(0, 18, 0, 28);

        TextView retryView = new TextView(this);
        retryView.setText("Retry");
        retryView.setTextColor(Color.rgb(17, 17, 17));
        retryView.setTextSize(16);
        retryView.setGravity(Gravity.CENTER);
        retryView.setPadding(28, 16, 28, 16);
        retryView.setOnClickListener(view -> {
            root.removeAllViews();
            root.addView(webView);
            loadPipUrl(currentAllowedUrl);
        });

        panel.addView(titleView);
        panel.addView(bodyView);
        panel.addView(retryView);

        root.removeAllViews();
        root.addView(panel, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
    }

    private String safeUrlForLog(String url) {
        Uri uri = Uri.parse(url);
        return safeHostForLog(uri) + safePathForLog(uri);
    }

    private String safeHostForLog(Uri uri) {
        String host = uri.getHost();
        return host == null ? "(none)" : host;
    }

    private String safePathForLog(Uri uri) {
        String path = uri.getPath();
        return path == null || path.isEmpty() ? "/" : path;
    }

    private class PipWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();

            if (isAllowedPipUri(uri)) {
                Log.i(TAG, "navigationAllowed host=" + PIP_HOST + " path=" + safePathForLog(uri));
                return false;
            }

            if (shouldOpenExternally(uri)) {
                openExternal(uri);
                return true;
            }

            Log.w(TAG, "navigationBlocked host=" + safeHostForLog(uri));
            showNativeError("Pip blocked this link", "This destination is not allowed inside the app.");
            return true;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            Log.e(TAG, "sslErrorBlocked");
            showNativeError("Pip could not verify this connection", "For your safety, Pip stopped loading this page.");
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                Log.w(TAG, "mainFrameError path=" + safePathForLog(request.getUrl()));
                showNativeError("Pip could not load", "Check your connection, then retry.");
            }
        }
    }
}
