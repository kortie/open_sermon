package com.juanstudio.open_sermon;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * App shell bridge (DESIGN 3.17, 8장):
 *  - ready(): the web app has rendered its first screen, so the launch splash can go.
 *  - "back" event: the system back key/gesture, handled by the web app (src/app/back.ts), which
 *    undoes the latest in-screen state or goes back one screen, and calls exit() at the first screen.
 *  - saveDownload(): a text file the user asked to save, written to the public Download folder
 *    (MediaStore, Android 10+; no storage permission). Older versions reject "unsupported".
 *  - email(): opens the user's email app with a subject and body filled in. Nothing is sent by the
 *    app; the user sends it from the email app. Rejects "no_app" when no email app is installed.
 */
@CapacitorPlugin(name = "Shell")
public class ShellPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).markWebReady();
        call.resolve();
    }

    /** Leave the app the way the system back key would at the first screen (task to background). */
    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
    }

    /** Hand the back key to the web app; false when it is not listening yet (still loading). */
    boolean dispatchBack() {
        if (!hasListeners("back")) return false;
        notifyListeners("back", new JSObject());
        return true;
    }

    @PluginMethod
    public void saveDownload(PluginCall call) {
        String name = call.getString("name");
        String text = call.getString("text");
        if (name == null || name.isEmpty() || text == null) {
            call.reject("bad input", "unknown");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("unsupported", "unsupported");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("insert");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("open");
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            JSObject ret = new JSObject();
            ret.put("name", savedName(resolver, uri, name));
            call.resolve(ret);
        } catch (Exception e) {
            if (uri != null) resolver.delete(uri, null, null);
            call.reject("save failed", "failed");
        }
    }

    /** The system may rename a file whose name is taken ("a (1).txt"); report the name it kept. */
    private static String savedName(ContentResolver resolver, Uri uri, String fallback) {
        try (Cursor c = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // fall through
        }
        return fallback;
    }

    @PluginMethod
    public void email(PluginCall call) {
        String subject = call.getString("subject", "");
        String text = call.getString("text", "");
        // Only email apps answer mailto:, so the chooser lists email apps only. Subject and body go in
        // the mailto: query (read by most mail apps) and in the extras (read by the rest).
        Uri uri = Uri.parse("mailto:?subject=" + Uri.encode(subject) + "&body=" + Uri.encode(text));
        Intent mail = new Intent(Intent.ACTION_SENDTO, uri);
        mail.putExtra(Intent.EXTRA_SUBJECT, subject);
        mail.putExtra(Intent.EXTRA_TEXT, text);
        if (getContext().getPackageManager().queryIntentActivities(mail, 0).isEmpty()) {
            call.reject("no email app", "no_app");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(Intent.createChooser(mail, call.getString("chooser", subject)));
                call.resolve();
            } catch (Exception e) {
                call.reject("no email app", "no_app");
            }
        });
    }
}
