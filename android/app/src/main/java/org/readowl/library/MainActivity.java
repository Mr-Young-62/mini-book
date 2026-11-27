package org.readowl.library;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.plugin.WebView;

import org.readowl.library.updater.AppUpdaterPlugin;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String OTA_PREFS = "ReadOwlOtaPrefs";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        validatePendingOtaBundle();
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    private void validatePendingOtaBundle() {
        SharedPreferences webPrefs = getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
        String serverPath = webPrefs.getString(WebView.CAP_SERVER_PATH, "");
        if (serverPath == null || serverPath.isEmpty()) {
            return;
        }

        SharedPreferences otaPrefs = getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE);
        File indexFile = new File(serverPath, "index.html");
        if (!indexFile.isFile()) {
            webPrefs.edit().putString(WebView.CAP_SERVER_PATH, "").apply();
            otaPrefs.edit()
                .remove("activeBundleVersion")
                .remove("activeBundleVersionCode")
                .remove("activeBundlePath")
                .putBoolean("pendingBoot", false)
                .putInt("pendingBootAttempts", 0)
                .apply();
            return;
        }

        if (otaPrefs.getBoolean("pendingBoot", false)) {
            int attempts = otaPrefs.getInt("pendingBootAttempts", 0) + 1;
            if (attempts > 2) {
                String fallbackPath = otaPrefs.getString("previousBundlePath", "");
                if (fallbackPath == null || fallbackPath.isEmpty() || !new File(fallbackPath, "index.html").isFile()) {
                    fallbackPath = "";
                }
                webPrefs.edit().putString(WebView.CAP_SERVER_PATH, fallbackPath).apply();
                otaPrefs.edit()
                    .putString("activeBundlePath", fallbackPath)
                    .remove("activeBundleVersion")
                    .remove("activeBundleVersionCode")
                    .putBoolean("pendingBoot", false)
                    .putInt("pendingBootAttempts", 0)
                    .apply();
            } else {
                otaPrefs.edit().putInt("pendingBootAttempts", attempts).apply();
            }
        }
    }
}
