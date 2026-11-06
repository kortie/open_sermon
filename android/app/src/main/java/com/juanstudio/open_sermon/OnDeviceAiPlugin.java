package com.juanstudio.open_sermon;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.SystemInstruction;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * On-device text generation with Gemini Nano through ML Kit GenAI Prompt API / AICore (DESIGN 3.6.1, S15).
 * Nothing the user wrote is logged or put in an error: rejections carry a fixed cause code only.
 * The model download is started only by download(), which the app calls when the user taps a button.
 */
@CapacitorPlugin(name = "OnDeviceAi")
public class OnDeviceAiPlugin extends Plugin {
    private final Executor executor = Executors.newSingleThreadExecutor();
    private GenerativeModelFutures model;

    private synchronized GenerativeModelFutures model() {
        if (model == null) model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        return model;
    }

    private interface Done<T> {
        void accept(T value) throws Exception;
    }

    private <T> void then(PluginCall call, ListenableFuture<T> future, Done<T> done) {
        future.addListener(() -> {
            try {
                done.accept(future.get());
            } catch (ExecutionException e) {
                call.reject("on-device: " + cause(e.getCause()), cause(e.getCause()));
            } catch (Exception e) {
                call.reject("on-device: " + cause(e), cause(e));
            }
        }, executor);
    }

    /** Fixed cause codes (src/core/llm/device.ts deviceCause maps them). */
    static String cause(Throwable t) {
        if (!(t instanceof GenAiException)) return "unknown";
        switch (((GenAiException) t).getErrorCode()) {
            case GenAiException.ErrorCode.BUSY:
                return "busy";
            case GenAiException.ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED:
                return "quota";
            case GenAiException.ErrorCode.BACKGROUND_USE_BLOCKED:
                return "background";
            case GenAiException.ErrorCode.REQUEST_TOO_LARGE:
                return "too_large";
            case GenAiException.ErrorCode.NOT_AVAILABLE:
            case GenAiException.ErrorCode.NOT_SUPPORTED:
            case GenAiException.ErrorCode.AICORE_INCOMPATIBLE:
            case GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE:
                return "unavailable";
            case GenAiException.ErrorCode.NOT_ENOUGH_DISK_SPACE:
                return "disk";
            case GenAiException.ErrorCode.CANCELLED:
                return "cancelled";
            default:
                return "unknown";
        }
    }

    static String statusName(int status) {
        switch (status) {
            case FeatureStatus.AVAILABLE:
                return "available";
            case FeatureStatus.DOWNLOADABLE:
                return "downloadable";
            case FeatureStatus.DOWNLOADING:
                return "downloading";
            default:
                return "unavailable";
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        GenerativeModelFutures m;
        try {
            m = model();
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("status", "unavailable");
            call.resolve(r);
            return;
        }
        then(call, m.checkStatus(), (Integer status) -> {
            JSObject r = new JSObject();
            String name = statusName(status);
            r.put("status", name);
            if (!"available".equals(name)) {
                call.resolve(r);
                return;
            }
            // Extra facts for the app's length budget; failures here do not change the status.
            try {
                r.put("tokenLimit", m.getTokenLimit().get());
            } catch (Exception ignored) {
                // left out
            }
            try {
                r.put("systemPrompt", m.isSystemPromptAvailable().get());
            } catch (Exception ignored) {
                // left out
            }
            try {
                r.put("baseModel", m.getBaseModelName().get());
            } catch (Exception ignored) {
                // left out
            }
            call.resolve(r);
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        GenerativeModelFutures m = model();
        then(call, m.download(new DownloadCallback() {
            @Override
            public void onDownloadProgress(long bytes) {
                JSObject p = new JSObject();
                p.put("bytes", bytes);
                notifyListeners("downloadProgress", p);
            }
        }), (Void v) -> call.resolve());
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String system = call.getString("system", "");
        String user = call.getString("user", "");
        Integer maxTokens = call.getInt("maxTokens");
        if (user == null || user.isEmpty()) {
            call.reject("on-device: unknown", "unknown");
            return;
        }
        GenerativeModelFutures m = model();
        // System instructions need a newer base model (nano-v3); otherwise they go in front of the user text.
        then(call, m.isSystemPromptAvailable(), (Boolean systemOk) -> {
            boolean hasSystem = system != null && !system.isEmpty();
            GenerateContentRequest.Builder b = !hasSystem
                    ? new GenerateContentRequest.Builder(new TextPart(user))
                    : Boolean.TRUE.equals(systemOk)
                            ? new GenerateContentRequest.Builder(new SystemInstruction(system), new TextPart(user))
                            : new GenerateContentRequest.Builder(new TextPart(system + "\n\n" + user));
            if (maxTokens != null) b.setMaxOutputTokens(maxTokens);
            then(call, m.generateContent(b.build()), (GenerateContentResponse res) -> {
                List<Candidate> c = res.getCandidates();
                String text = c == null || c.isEmpty() ? null : c.get(0).getText();
                if (text == null || text.isEmpty()) {
                    call.reject("on-device: unknown", "unknown");
                    return;
                }
                JSObject r = new JSObject();
                r.put("text", text);
                call.resolve(r);
            });
        });
    }
}
