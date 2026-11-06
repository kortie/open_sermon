package com.juanstudio.open_sermon;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App shell bridge (DESIGN 3.17, 8장):
 *  - ready(): the web app has rendered its first screen, so the launch splash can go.
 *  - "back" event: the system back key/gesture, handled by the web app (src/app/back.ts), which
 *    undoes the latest in-screen state or goes back one screen, and calls exit() at the first screen.
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
}
