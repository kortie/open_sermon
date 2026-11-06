package com.juanstudio.open_sermon;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * "Buy the developer a coffee" (DESIGN 3.17, S16): one consumable one-time product through Google Play
 * Billing. Nothing is unlocked by it, so there is no server-side check: a purchase is consumed right away
 * so it can be bought again. Rejections carry a fixed cause code only; no order data is passed to the app.
 */
@CapacitorPlugin(name = "Coffee")
public class CoffeePlugin extends Plugin implements PurchasesUpdatedListener {
    private static final Pattern PRODUCT_ID = Pattern.compile("^[a-z0-9][a-z0-9._]{0,98}$");
    private BillingClient client;
    private PluginCall buying;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    /** Fixed cause codes (src/app/platform.ts coffee bridge). */
    static String cause(int code) {
        switch (code) {
            case BillingClient.BillingResponseCode.USER_CANCELED:
                return "cancelled";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
            case BillingClient.BillingResponseCode.SERVICE_TIMEOUT:
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
                return "network";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED:
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:
                return "unavailable";
            default:
                return "unknown";
        }
    }

    private void whenReady(PluginCall call, Runnable next) {
        if (client.isReady()) {
            next.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) next.run();
                else call.reject("coffee: " + cause(r.getResponseCode()), cause(r.getResponseCode()));
            }

            @Override
            public void onBillingServiceDisconnected() {
                // auto reconnection is on; the next call connects again
            }
        });
    }

    private interface Found {
        void accept(ProductDetails details);
    }

    private void findProduct(PluginCall call, String id, Found found) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
                .build();
        client.queryProductDetailsAsync(params, (r, result) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("coffee: " + cause(r.getResponseCode()), cause(r.getResponseCode()));
                return;
            }
            List<ProductDetails> list = result.getProductDetailsList();
            found.accept(list == null || list.isEmpty() ? null : list.get(0));
        });
    }

    /** Consume coffee purchases left from an earlier run (e.g. the app closed before consuming). */
    private void consumeLeftovers(String id, Runnable then) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, purchases) -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase p : purchases) {
                    if (p.getProducts().contains(id) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) consume(p, null);
                }
            }
            then.run();
        });
    }

    private void consume(Purchase p, PluginCall call) {
        client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), (r, token) -> {
            if (call == null) return;
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) resolveResult(call, "thanks");
            else call.reject("coffee: " + cause(r.getResponseCode()), cause(r.getResponseCode()));
        });
    }

    private static void resolveResult(PluginCall call, String result) {
        JSObject r = new JSObject();
        r.put("result", result);
        call.resolve(r);
    }

    private String productId(PluginCall call) {
        String id = call.getString("productId", "");
        if (id == null || !PRODUCT_ID.matcher(id).matches()) {
            call.reject("coffee: unknown", "unknown");
            return null;
        }
        return id;
    }

    /** {available, price?}: whether the product can be bought here and its localized price. */
    @PluginMethod
    public void product(PluginCall call) {
        String id = productId(call);
        if (id == null) return;
        whenReady(call, () -> consumeLeftovers(id, () -> findProduct(call, id, (details) -> {
            JSObject r = new JSObject();
            ProductDetails.OneTimePurchaseOfferDetails offer = details == null ? null : details.getOneTimePurchaseOfferDetails();
            r.put("available", offer != null);
            if (offer != null) r.put("price", offer.getFormattedPrice());
            call.resolve(r);
        })));
    }

    /** {result: thanks | pending | cancelled}. */
    @PluginMethod
    public void buy(PluginCall call) {
        String id = productId(call);
        if (id == null) return;
        if (buying != null) {
            call.reject("coffee: busy", "busy");
            return;
        }
        whenReady(call, () -> consumeLeftovers(id, () -> findProduct(call, id, (details) -> {
            if (details == null) {
                call.reject("coffee: unavailable", "unavailable");
                return;
            }
            BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .build()))
                    .build();
            getActivity().runOnUiThread(() -> {
                buying = call;
                BillingResult r = client.launchBillingFlow(getActivity(), params);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    buying = null;
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) resolveResult(call, "cancelled");
                    else call.reject("coffee: " + cause(r.getResponseCode()), cause(r.getResponseCode()));
                }
            });
        })));
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = buying;
        buying = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase p = purchases.get(0);
            if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                if (call != null) consume(p, call);
                else consume(p, null);
                return;
            }
            if (call != null) resolveResult(call, "pending");
            return;
        }
        if (call == null) return;
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) resolveResult(call, "cancelled");
        else call.reject("coffee: " + cause(code), cause(code));
    }
}
