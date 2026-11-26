package org.readowl.library.updater;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String EVENT_PROGRESS = "downloadProgress";
    private static final String HOST = "storage.googleapis.com";
    private static final Pattern APK_PATH = Pattern.compile(
        "^/[a-z0-9._-]+/MeelieFont-v\\d+\\.\\d+\\.\\d+([.-][A-Za-z0-9.-]+)?\\.apk$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final long MAX_BYTES = 500L * 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        Integer fileSize = call.getInt("fileSize");
        Integer versionCode = call.getInt("versionCode");

        if (url == null || sha256 == null || fileSize == null || versionCode == null) {
            call.reject("Missing download parameters");
            return;
        }
        if (!isAllowedUrl(url)) {
            call.reject("Download URL is not allowed");
            return;
        }
        if (!SHA256.matcher(sha256).matches()) {
            call.reject("Invalid checksum");
            return;
        }
        if (fileSize <= 0 || fileSize > MAX_BYTES) {
            call.reject("Invalid file size");
            return;
        }

        cancelled = false;
        final String targetUrl = url;
        final String expectedSha = sha256.toLowerCase(Locale.US);
        final long expectedSize = fileSize.longValue();
        final int code = versionCode;
        executor.execute(() -> performDownload(call, targetUrl, expectedSha, expectedSize, code));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            rejectOnMain(call, "Missing APK path");
            return;
        }
        File file = new File(path);
        if (!file.exists() || !file.isFile()) {
            rejectOnMain(call, "APK file not found");
            return;
        }

        String archiveError = verifyArchive(file);
        if (archiveError != null) {
            rejectOnMain(call, archiveError);
            return;
        }

        if (!canInstallPackages()) {
            JSObject data = new JSObject();
            data.put("error", "Install permission not granted");
            data.put("action", "openSettings");
            data.put("settingsIntent", settingsIntent().toURI());
            call.resolve(data);
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            "org.readowl.library.fileprovider",
            file
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            rejectOnMain(call, "Could not open installer: " + error.getMessage());
        }
    }

    private String verifyArchive(File file) {
        PackageManager pm = getContext().getPackageManager();
        PackageInfo archiveInfo = pm.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        if (archiveInfo == null) {
            return "APK could not be parsed";
        }
        if (!"org.readowl.library".equals(archiveInfo.packageName)) {
            return "APK package does not match this app";
        }
        Signature[] archiveSignatures = archiveInfo.signatures;
        PackageInfo installedInfo;
        try {
            installedInfo = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
        } catch (PackageManager.NameNotFoundException error) {
            return "Installed app signature unavailable";
        }
        Signature[] installedSignatures = installedInfo.signatures;
        if (archiveSignatures == null || archiveSignatures.length == 0
            || installedSignatures == null || installedSignatures.length == 0) {
            return "APK signature unavailable";
        }
        if (!Arrays.equals(archiveSignatures[0].toByteArray(), installedSignatures[0].toByteArray())) {
            return "APK signature does not match this app";
        }
        return null;
    }

    private boolean canInstallPackages() {
        PackageManager pm = getContext().getPackageManager();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            try {
                return pm.getPackageInfo("com.android.packageinstaller", 0) != null;
            } catch (PackageManager.NameNotFoundException error) {
                return false;
            }
        }
        return pm.canRequestPackageInstalls();
    }

    private Intent settingsIntent() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        return new Intent(Settings.ACTION_APPLICATION_SETTINGS);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            startActivity(settingsIntent());
            call.resolve();
        } catch (Exception error) {
            rejectOnMain(call, "Could not open settings: " + error.getMessage());
        }
    }

    private void startActivity(Intent intent) {
        if (getActivity() != null) {
            getActivity().startActivity(intent);
        } else {
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "updates");
        File[] files = dir.listFiles();
        if (files != null) {
            long cutoff = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000;
            for (File file : files) {
                if (file.lastModified() < cutoff) {
                    if (!file.delete()) {
                        call.reject("Could not clean old update file");
                        return;
                    }
                }
            }
        }
        call.resolve();
    }

    private boolean isAllowedUrl(String value) {
        try {
            URL url = new URL(value);
            return "https".equalsIgnoreCase(url.getProtocol())
                && HOST.equalsIgnoreCase(url.getHost())
                && APK_PATH.matcher(url.getPath()).matches();
        } catch (Exception error) {
            return false;
        }
    }

    private void resolveOnMain(PluginCall call, JSObject data) {
        getActivity().runOnUiThread(() -> call.resolve(data));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    private void emitProgress(long received, long total, int versionCode) {
        getActivity().runOnUiThread(() -> {
            JSObject data = new JSObject();
            data.put("received", received);
            data.put("total", total);
            data.put("versionCode", versionCode);
            notifyListeners(EVENT_PROGRESS, data);
        });
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value & 0xff));
        }
        return builder.toString();
    }

    private void performDownload(PluginCall call, String urlString, String expectedSha, long expectedSize, int versionCode) {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            rejectOnMain(call, "Could not create update cache directory");
            return;
        }

        File part = new File(dir, "readowl-" + versionCode + ".apk.part");
        File target = new File(dir, "readowl-" + versionCode + ".apk");
        long offset = part.exists() ? part.length() : 0;
        if (offset >= expectedSize) {
            if (!part.delete()) {
                rejectOnMain(call, "Could not reset incomplete download");
                return;
            }
            offset = 0;
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlString).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            if (offset > 0) {
                connection.setRequestProperty("Range", "bytes=" + offset + "-");
            }

            int status = connection.getResponseCode();
            boolean append = false;
            if (offset > 0 && status == HttpURLConnection.HTTP_PARTIAL) {
                append = true;
            } else if (status == HttpURLConnection.HTTP_OK) {
                offset = 0;
                if (part.exists() && !part.delete()) {
                    rejectOnMain(call, "Could not reset incomplete download");
                    return;
                }
            } else {
                rejectOnMain(call, "Download failed with HTTP " + status);
                return;
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            if (append) {
                try (FileInputStream existing = new FileInputStream(part)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = existing.read(buffer)) != -1) {
                        digest.update(buffer, 0, read);
                    }
                }
            }

            long received = offset;
            long lastEmit = 0;
            byte[] buffer = new byte[16384];
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part, append)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancelled) {
                        rejectOnMain(call, "Download cancelled");
                        return;
                    }
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    received += read;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 250) {
                        emitProgress(received, expectedSize, versionCode);
                        lastEmit = now;
                    }
                }
            }
            emitProgress(received, expectedSize, versionCode);

            if (received != expectedSize) {
                rejectOnMain(call, "Downloaded size does not match the manifest");
                return;
            }
            String actualSha = hex(digest.digest());
            if (!expectedSha.equals(actualSha)) {
                if (!part.delete()) {
                    rejectOnMain(call, "Checksum mismatch and downloaded file could not be removed");
                    return;
                }
                rejectOnMain(call, "Checksum mismatch");
                return;
            }
            if (!part.renameTo(target)) {
                rejectOnMain(call, "Could not finalize downloaded APK");
                return;
            }

            JSObject result = new JSObject();
            result.put("path", target.getAbsolutePath());
            result.put("sha256", actualSha);
            result.put("fileSize", received);
            resolveOnMain(call, result);
        } catch (Exception error) {
            rejectOnMain(call, "Download failed: " + error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
