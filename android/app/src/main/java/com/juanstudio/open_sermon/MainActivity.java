package com.juanstudio.open_sermon;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewTreeObserver;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    /** Longest the launch splash waits for the web app (DESIGN 3.17); after this the app shows anyway. */
    private static final long SPLASH_MAX_MS = 3000;

    private volatile boolean webReady = false;

    /** Called by ShellPlugin when the web app has rendered its first screen. */
    void markWebReady() {
        webReady = true;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are registered before the bridge starts.
        registerPlugin(OnDeviceAiPlugin.class);
        registerPlugin(CoffeePlugin.class);
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);
        holdSplashUntilWebReady();
        handBackKeyToWebApp();
    }

    /**
     * Keep the launch splash (Android 12+ system splash, or the launch theme's splash image below 12) on
     * screen until the web app has rendered, so there is one splash and no blank WebView in between.
     * Returning false from onPreDraw skips the frame; the system schedules the next one.
     */
    private void holdSplashUntilWebReady() {
        final long start = SystemClock.uptimeMillis();
        final View content = findViewById(android.R.id.content);
        content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                if (!webReady && SystemClock.uptimeMillis() - start < SPLASH_MAX_MS) return false;
                content.getViewTreeObserver().removeOnPreDrawListener(this);
                return true;
            }
        });
    }

    /**
     * The back key/gesture goes to the web app, which steps back through in-screen states and screens
     * (DESIGN 8장). Before the web app listens, the system default applies.
     */
    private void handBackKeyToWebApp() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("Shell");
                if (handle != null && ((ShellPlugin) handle.getInstance()).dispatchBack()) return;
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
