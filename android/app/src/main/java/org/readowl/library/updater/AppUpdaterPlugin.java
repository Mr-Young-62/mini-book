package org.readowl.library.updater;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.WebView;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String EVENT_PROGRESS = "downloadProgress";
    private static final String OTA_PREFS = "ReadOwlOtaPrefs";
    private static final String GCS_HOST = "storage.googleapis.com";
    private static final String GITHUB_HOST = "github.com";
    private static final Pattern SUPABASE_HOST = Pattern.compile("^[a-z0-9-]+\\.supabase\\.co$", Pattern.CASE_INSENSITIVE);
    private static final Set<String> REDIRECT_CDN_HOSTS = new HashSet<>(Arrays.asList(
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com"
    ));

    private static final Pattern GCS_APK_PATH = Pattern.compile(
        "^/[a-z0-9._-]+/MeelieFont-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.apk$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SUPABASE_APK_PATH = Pattern.compile(
        "^/storage/v1/object/public/[a-z0-9._-]+/(?:[a-z0-9._-]+/)*MeelieFont-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.apk$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern GITHUB_APK_PATH = Pattern.compile(
        "^/[^/]+/[^/]+/releases/download/v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?/MeelieFont-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.apk$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern GCS_BUNDLE_PATH = Pattern.compile(
        "^/[a-z0-9._-]+/MeelieFont-bundle-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.zip$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SUPABASE_BUNDLE_PATH = Pattern.compile(
        "^/storage/v1/object/public/[a-z0-9._-]+/(?:[a-z0-9._-]+/)*MeelieFont-bundle-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.zip$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern GITHUB_BUNDLE_PATH = Pattern.compile(
        "^/[^/]+/[^/]+/releases/download/v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?/MeelieFont-bundle-v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?\\.zip$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern SUPABASE_MANIFEST_PATH = Pattern.compile(
        "^/storage/v1/object/public/[a-z0-9._-]+/(?:[a-z0-9._-]+/)*latest\\.json$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern GITHUB_MANIFEST_PATH = Pattern.compile(
        "^/[^/]+/[^/]+/releases/(?:latest/download|download/v\\d+\\.\\d+\\.\\d+(?:[.-][A-Za-z0-9.-]+)?)/latest\\.json$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final long MAX_APK_BYTES = 500L * 1024 * 1024;
    private static final long MAX_BUNDLE_BYTES = 150L * 1024 * 1024;
    private static final long MAX_EXTRACTED_BUNDLE_BYTES = 200L * 1024 * 1024;
    private static final int MAX_MANIFEST_BYTES = 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;

    @PluginMethod
    public void fetchManifest(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !isAllowedManifestUrl(url)) {
            call.reject("Manifest URL is not allowed");
            return;
        }
        executor.execute(() -> performManifestFetch(call, url));
    }

    @PluginMethod
    public void getInstalledInfo(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = PackageInfoCompat.getLongVersionCode(info);
            String versionName = info.versionName != null ? info.versionName : "0.0.0";

            SharedPreferences webPrefs = getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
            SharedPreferences otaPrefs = getContext().getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE);
            String serverPath = webPrefs.getString(WebView.CAP_SERVER_PATH, "");
            String activeVersion = "";
            int activeCode = 0;

            if (serverPath != null && !serverPath.isEmpty() && new File(serverPath, "index.html").isFile()) {
                activeVersion = otaPrefs.getString("activeBundleVersion", "");
                activeCode = otaPrefs.getInt("activeBundleVersionCode", 0);
            } else if (otaPrefs.getInt("activeBundleVersionCode", 0) != 0) {
                otaPrefs.edit()
                    .remove("activeBundleVersion")
                    .remove("activeBundleVersionCode")
                    .remove("activeBundlePath")
                    .putBoolean("pendingBoot", false)
                    .putInt("pendingBootAttempts", 0)
                    .apply();
            }

            JSObject result = new JSObject();
            result.put("versionName", versionName);
            result.put("versionCode", versionCode);
            result.put("activeBundleVersion", activeVersion != null ? activeVersion : "");
            result.put("activeBundleVersionCode", activeCode);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read installed version info: " + error.getMessage());
        }
    }

    @PluginMethod
    public void confirmBundle(PluginCall call) {
        SharedPreferences otaPrefs = getContext().getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE);
        SharedPreferences webPrefs = getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
        otaPrefs.edit()
            .putBoolean("pendingBoot", false)
            .putInt("pendingBootAttempts", 0)
            .apply();

        String activePath = webPrefs.getString(WebView.CAP_SERVER_PATH, "");
        File bundlesRoot = new File(getContext().getFilesDir(), "ota-bundles");
        File[] dirs = bundlesRoot.listFiles();
        if (dirs != null) {
            for (File dir : dirs) {
                if (activePath == null || !dir.getAbsolutePath().equals(activePath)) {
                    deleteRecursively(dir);
                }
            }
        }
        call.resolve();
    }

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
        if (!isAllowedApkUrl(url)) {
            call.reject("Download URL is not allowed");
            return;
        }
        if (!SHA256.matcher(sha256).matches()) {
            call.reject("Invalid checksum");
            return;
        }
        if (fileSize <= 0 || fileSize > MAX_APK_BYTES) {
            call.reject("Invalid file size");
            return;
        }

        cancelled = false;
        final String targetUrl = url;
        final String expectedSha = sha256.toLowerCase(Locale.US);
        final long expectedSize = fileSize.longValue();
        final int code = versionCode;
        executor.execute(() -> performApkDownload(call, targetUrl, expectedSha, expectedSize, code));
    }

    @PluginMethod
    public void downloadBundle(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        Integer fileSize = call.getInt("fileSize");
        String version = call.getString("version");
        Integer versionCode = call.getInt("versionCode");

        if (url == null || sha256 == null || fileSize == null || version == null || version.trim().isEmpty() || versionCode == null) {
            call.reject("Missing bundle parameters");
            return;
        }
        if (!isAllowedBundleUrl(url)) {
            call.reject("Bundle URL is not allowed");
            return;
        }
        if (!SHA256.matcher(sha256).matches()) {
            call.reject("Invalid bundle checksum");
            return;
        }
        if (fileSize <= 0 || fileSize > MAX_BUNDLE_BYTES || versionCode <= 0) {
            call.reject("Invalid bundle size or versionCode");
            return;
        }

        cancelled = false;
        final String targetUrl = url;
        final String expectedSha = sha256.toLowerCase(Locale.US);
        final long expectedSize = fileSize.longValue();
        final String cleanVersion = version.trim();
        final int code = versionCode;
        executor.execute(() -> performBundleDownload(call, targetUrl, expectedSha, expectedSize, cleanVersion, code));
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

    @SuppressWarnings("deprecation")
    private Signature[] getPackageSignatures(PackageInfo info) {
        if (info == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = info.signingInfo;
            if (signingInfo != null) {
                Signature[] signers = signingInfo.getApkContentsSigners();
                if (signers != null && signers.length > 0) return signers;
            }
        }
        return info.signatures;
    }

    @SuppressWarnings("deprecation")
    private String verifyArchive(File file) {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo archiveInfo = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (archiveInfo == null) {
            return "APK could not be parsed";
        }
        if (!"org.readowl.library".equals(archiveInfo.packageName)) {
            return "APK package does not match this app";
        }
        Signature[] archiveSignatures = getPackageSignatures(archiveInfo);
        PackageInfo installedInfo;
        try {
            installedInfo = pm.getPackageInfo(getContext().getPackageName(), flags);
        } catch (PackageManager.NameNotFoundException error) {
            return "Installed app signature unavailable";
        }
        Signature[] installedSignatures = getPackageSignatures(installedInfo);
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

    private boolean isAllowedManifestUrl(String value) {
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            String host = url.getHost().toLowerCase(Locale.US);
            String path = url.getPath();
            if (GCS_HOST.equals(host)) return path.endsWith("/latest.json");
            if (SUPABASE_HOST.matcher(host).matches()) return SUPABASE_MANIFEST_PATH.matcher(path).matches();
            if (GITHUB_HOST.equals(host)) return GITHUB_MANIFEST_PATH.matcher(path).matches();
            return false;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isAllowedApkUrl(String value) {
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            String host = url.getHost().toLowerCase(Locale.US);
            String path = url.getPath();
            if (GCS_HOST.equals(host)) return GCS_APK_PATH.matcher(path).matches();
            if (SUPABASE_HOST.matcher(host).matches()) return SUPABASE_APK_PATH.matcher(path).matches();
            if (GITHUB_HOST.equals(host)) return GITHUB_APK_PATH.matcher(path).matches();
            return false;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isAllowedBundleUrl(String value) {
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            String host = url.getHost().toLowerCase(Locale.US);
            String path = url.getPath();
            if (GCS_HOST.equals(host)) return GCS_BUNDLE_PATH.matcher(path).matches();
            if (SUPABASE_HOST.matcher(host).matches()) return SUPABASE_BUNDLE_PATH.matcher(path).matches();
            if (GITHUB_HOST.equals(host)) return GITHUB_BUNDLE_PATH.matcher(path).matches();
            return false;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isAllowedRedirectUrl(URL url) {
        if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
        String host = url.getHost().toLowerCase(Locale.US);
        return GCS_HOST.equals(host)
            || GITHUB_HOST.equals(host)
            || SUPABASE_HOST.matcher(host).matches()
            || REDIRECT_CDN_HOSTS.contains(host);
    }

    private HttpURLConnection openAllowedConnection(String initialUrl, long rangeOffset) throws IOException {
        URL currentUrl = new URL(initialUrl);
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            if (rangeOffset > 0) {
                connection.setRequestProperty("Range", "bytes=" + rangeOffset + "-");
            }
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IOException("Redirect without Location header");
                }
                URL nextUrl = new URL(currentUrl, location);
                if (!isAllowedRedirectUrl(nextUrl)) {
                    throw new IOException("Redirect target host is not allowed: " + nextUrl.getHost());
                }
                currentUrl = nextUrl;
                continue;
            }
            return connection;
        }
        throw new IOException("Too many redirects");
    }

    private void runOnUi(Runnable action) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(action);
        } else {
            action.run();
        }
    }

    private void resolveOnMain(PluginCall call, JSObject data) {
        runOnUi(() -> call.resolve(data));
    }

    private void rejectOnMain(PluginCall call, String message) {
        runOnUi(() -> call.reject(message));
    }

    private void emitProgress(long received, long total, int versionCode) {
        runOnUi(() -> {
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

    private static void deleteRecursively(File target) {
        if (target == null || !target.exists()) return;
        File[] children = target.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        target.delete();
    }

    private void performManifestFetch(PluginCall call, String urlString) {
        HttpURLConnection connection = null;
        try {
            connection = openAllowedConnection(urlString, 0);
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                rejectOnMain(call, "Manifest HTTP " + status);
                return;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            try (InputStream input = connection.getInputStream()) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_MANIFEST_BYTES) {
                        rejectOnMain(call, "Manifest exceeds maximum size");
                        return;
                    }
                    out.write(buffer, 0, read);
                }
            }
            JSObject result = new JSObject();
            result.put("text", out.toString(StandardCharsets.UTF_8.name()));
            resolveOnMain(call, result);
        } catch (Exception error) {
            rejectOnMain(call, "Manifest fetch failed: " + error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean downloadVerifiedFile(
        PluginCall call,
        String urlString,
        String expectedSha,
        long expectedSize,
        int versionCode,
        File part,
        File target
    ) throws Exception {
        long offset = part.exists() ? part.length() : 0;
        if (offset >= expectedSize) {
            if (!part.delete()) {
                rejectOnMain(call, "Could not reset incomplete download");
                return false;
            }
            offset = 0;
        }

        HttpURLConnection connection = null;
        try {
            connection = openAllowedConnection(urlString, offset);
            int status = connection.getResponseCode();
            boolean append = false;
            if (offset > 0 && status == HttpURLConnection.HTTP_PARTIAL) {
                append = true;
            } else if (status == HttpURLConnection.HTTP_OK) {
                offset = 0;
                if (part.exists() && !part.delete()) {
                    rejectOnMain(call, "Could not reset incomplete download");
                    return false;
                }
            } else {
                rejectOnMain(call, "Download failed with HTTP " + status);
                return false;
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
                        return false;
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
                return false;
            }
            String actualSha = hex(digest.digest());
            if (!expectedSha.equals(actualSha)) {
                if (!part.delete()) {
                    rejectOnMain(call, "Checksum mismatch and downloaded file could not be removed");
                    return false;
                }
                rejectOnMain(call, "Checksum mismatch");
                return false;
            }
            if (target.exists() && !target.delete()) {
                rejectOnMain(call, "Could not replace previous downloaded file");
                return false;
            }
            if (!part.renameTo(target)) {
                rejectOnMain(call, "Could not finalize downloaded file");
                return false;
            }
            return true;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void performApkDownload(PluginCall call, String urlString, String expectedSha, long expectedSize, int versionCode) {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            rejectOnMain(call, "Could not create update cache directory");
            return;
        }

        File part = new File(dir, "readowl-" + versionCode + ".apk.part");
        File target = new File(dir, "readowl-" + versionCode + ".apk");
        try {
            if (!downloadVerifiedFile(call, urlString, expectedSha, expectedSize, versionCode, part, target)) {
                return;
            }
            JSObject result = new JSObject();
            result.put("path", target.getAbsolutePath());
            result.put("sha256", expectedSha);
            result.put("fileSize", expectedSize);
            resolveOnMain(call, result);
        } catch (Exception error) {
            rejectOnMain(call, "Download failed: " + error.getMessage());
        }
    }

    private void performBundleDownload(
        PluginCall call,
        String urlString,
        String expectedSha,
        long expectedSize,
        String version,
        int versionCode
    ) {
        File cacheDir = new File(getContext().getCacheDir(), "updates");
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            rejectOnMain(call, "Could not create update cache directory");
            return;
        }

        File part = new File(cacheDir, "readowl-bundle-" + versionCode + ".zip.part");
        File archive = new File(cacheDir, "readowl-bundle-" + versionCode + ".zip");
        File bundlesRoot = new File(getContext().getFilesDir(), "ota-bundles");
        File stagingDir = new File(bundlesRoot, "staging-" + versionCode);
        File finalDir = new File(bundlesRoot, String.valueOf(versionCode));

        try {
            if (!downloadVerifiedFile(call, urlString, expectedSha, expectedSize, versionCode, part, archive)) {
                return;
            }

            deleteRecursively(stagingDir);
            if (!stagingDir.mkdirs()) {
                rejectOnMain(call, "Could not prepare bundle staging directory");
                return;
            }

            extractZipSafely(archive, stagingDir);
            archive.delete();

            File indexFile = new File(stagingDir, "index.html");
            if (!indexFile.isFile() || indexFile.length() == 0) {
                deleteRecursively(stagingDir);
                rejectOnMain(call, "Bundle does not contain a valid index.html");
                return;
            }

            deleteRecursively(finalDir);
            if (!stagingDir.renameTo(finalDir)) {
                deleteRecursively(stagingDir);
                rejectOnMain(call, "Could not finalize extracted bundle");
                return;
            }

            SharedPreferences webPrefs = getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
            String previousPath = webPrefs.getString(WebView.CAP_SERVER_PATH, "");
            String nextPath = finalDir.getAbsolutePath();

            SharedPreferences otaPrefs = getContext().getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE);
            otaPrefs.edit()
                .putString("previousBundlePath", previousPath != null ? previousPath : "")
                .putString("activeBundleVersion", version)
                .putInt("activeBundleVersionCode", versionCode)
                .putString("activeBundlePath", nextPath)
                .putBoolean("pendingBoot", true)
                .putInt("pendingBootAttempts", 0)
                .apply();

            webPrefs.edit().putString(WebView.CAP_SERVER_PATH, nextPath).apply();

            runOnUi(() -> {
                if (getBridge() != null) {
                    getBridge().setServerBasePath(nextPath);
                }
                JSObject result = new JSObject();
                result.put("path", nextPath);
                result.put("version", version);
                result.put("versionCode", versionCode);
                call.resolve(result);
            });
        } catch (Exception error) {
            deleteRecursively(stagingDir);
            archive.delete();
            rejectOnMain(call, "Bundle update failed: " + error.getMessage());
        }
    }

    private void extractZipSafely(File zipFile, File destDir) throws IOException {
        String destCanonical = destDir.getCanonicalPath();
        long extractedBytes = 0;
        byte[] buffer = new byte[16384];
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(destDir, entry.getName());
                String outCanonical = outFile.getCanonicalPath();
                if (entry.isDirectory()) {
                    if (!outCanonical.equals(destCanonical) && !outCanonical.startsWith(destCanonical + File.separator)) {
                        throw new IOException("Blocked invalid zip directory: " + entry.getName());
                    }
                    if (!outFile.exists() && !outFile.mkdirs()) {
                        throw new IOException("Could not create directory: " + entry.getName());
                    }
                } else {
                    if (!outCanonical.startsWith(destCanonical + File.separator)) {
                        throw new IOException("Blocked invalid zip path: " + entry.getName());
                    }
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        throw new IOException("Could not create parent directory for: " + entry.getName());
                    }
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        int read;
                        while ((read = zis.read(buffer)) != -1) {
                            extractedBytes += read;
                            if (extractedBytes > MAX_EXTRACTED_BUNDLE_BYTES) {
                                throw new IOException("Extracted bundle exceeds size limit");
                            }
                            fos.write(buffer, 0, read);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }
}
