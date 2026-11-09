// Browser vs. Capacitor app differences (DESIGN 2.1.2, v0.18; S13). The only place that branches
// on the platform. Files are never sent anywhere by the app: in the browser they are downloaded,
// in the app they are written to the app's cache folder and handed to the system share sheet, where
// the user picks where to save or send them.
import { Capacitor, CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { providers } from '../../config/app.config.json';
import type { DeviceAiBridge, DeviceAiInfo, FetchFn } from '../core/llm';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export type SaveResult = 'saved' | 'cancelled';

const URL_LIFETIME_MS = 60_000;

function downloadInBrowser(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), URL_LIFETIME_MS);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

/** A share sheet closed without choosing a target rejects; that is not an error for the user. */
const isCancel = (err: unknown) => /cancel/i.test(err instanceof Error ? err.message : String(err));

export interface NativeFileApi {
  write: (path: string, base64: string) => Promise<string>;
  share: (title: string, uri: string) => Promise<void>;
}

async function nativeFileApi(): Promise<NativeFileApi> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  return {
    write: async (path, data) => (await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })).uri,
    share: async (title, uri) => {
      await Share.share({ title, files: [uri] });
    },
  };
}

/** Save a file the user asked for (backup, sample template). */
export async function saveFile(name: string, blob: Blob, opts: { native?: boolean; api?: NativeFileApi } = {}): Promise<SaveResult> {
  if (!(opts.native ?? isNativeApp())) {
    downloadInBrowser(name, blob);
    return 'saved';
  }
  const api = opts.api ?? (await nativeFileApi());
  const uri = await api.write(`exports/${name}`, toBase64(new Uint8Array(await blob.arrayBuffer())));
  try {
    await api.share(name, uri);
    return 'saved';
  } catch (err) {
    if (isCancel(err)) return 'cancelled';
    throw err;
  }
}

export type TextSaveResult = { kind: 'downloads'; name: string } | { kind: 'saved' } | { kind: 'cancelled' };

/** Native text-export calls (ShellPlugin.java). Rejections carry a fixed code. */
export interface TextExportApi {
  saveDownload?: (name: string, text: string) => Promise<{ name: string }>;
  email?: (subject: string, text: string, chooser: string) => Promise<void>;
  shareText?: (subject: string, text: string) => Promise<void>;
}

const codeOf = (err: unknown) => (typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined);

function nativeTextApi(native: boolean): TextExportApi {
  if (!native) return {};
  const plugin = Capacitor.isPluginAvailable('Shell') ? registerPlugin<ShellPlugin>('Shell') : null;
  return {
    saveDownload: plugin ? (name, text) => plugin.saveDownload({ name, text }) : undefined,
    email: plugin ? (subject, text, chooser) => plugin.email({ subject, text, chooser }) : undefined,
    shareText: async (subject, text) => {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: subject, text, dialogTitle: subject });
    },
  };
}

/**
 * Save a text the user asked to keep (a generated result). Android 10+ app: straight into the
 * Download folder. Older Android and iOS: the share sheet (the user picks where). Browser: a download.
 */
export async function saveTextFile(name: string, text: string, opts: { native?: boolean; api?: TextExportApi; fileApi?: NativeFileApi } = {}): Promise<TextSaveResult> {
  const native = opts.native ?? isNativeApp();
  const api = opts.api ?? nativeTextApi(native);
  if (native && api.saveDownload) {
    try {
      return { kind: 'downloads', name: (await api.saveDownload(name, text)).name };
    } catch (err) {
      if (codeOf(err) !== 'unsupported') throw err;
    }
  }
  const r = await saveFile(name, new Blob([text], { type: 'text/plain;charset=utf-8' }), { native, api: opts.fileApi });
  return { kind: r };
}

/**
 * Hand a text to the user's email app (subject and body filled in). The app sends nothing itself.
 * Android app: a chooser of email apps, or the share sheet when there is none. iOS app: the share
 * sheet (Mail is in it). Browser: the system share when there is one, otherwise a mailto: link.
 */
export async function sendTextByEmail(subject: string, text: string, chooser: string, opts: { native?: boolean; api?: TextExportApi } = {}): Promise<'opened' | 'cancelled'> {
  const native = opts.native ?? isNativeApp();
  const api = opts.api ?? nativeTextApi(native);
  try {
    if (native && api.email) {
      try {
        await api.email(subject, text, chooser);
        return 'opened';
      } catch (err) {
        if (codeOf(err) !== 'no_app' || !api.shareText) throw err;
      }
    }
    if (native && api.shareText) {
      await api.shareText(subject, text);
      return 'opened';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: subject, text });
      return 'opened';
    }
  } catch (err) {
    if (isCancel(err) || (err instanceof DOMException && err.name === 'AbortError')) return 'cancelled';
    throw err;
  }
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return 'opened';
}

/** Native HTTP request of the app (Capacitor's CapacitorHttp plugin). */
export interface NativeHttpPlugin {
  request(o: { url: string; method: string; headers: Record<string, string>; data?: unknown; responseType: 'text' }): Promise<{ status: number; data: unknown }>;
}

const aborted = () => new DOMException('Aborted', 'AbortError');

/** Endpoints of providers used only through the app's native HTTP (config app_direct_verified). */
export function appDirectEndpoints(cfg: Record<string, { endpoint: string; browser_direct_verified: boolean; app_direct_verified?: boolean }> = providers): string[] {
  return Object.values(cfg)
    .filter((p) => p.browser_direct_verified !== true && p.app_direct_verified === true && URL.canParse(p.endpoint) && new URL(p.endpoint).protocol === 'https:')
    .map((p) => p.endpoint);
}

/**
 * fetch over native HTTP, for providers whose servers refuse browser CORS (OpenAI; user decision
 * 2026-11-09). Native requests are outside the page CSP, so this checks the URL itself: only the
 * configured endpoints (exact, or a path below one) are sent; anything else fails before a request.
 * A cancel settles at once (the native request finishes on its own and is ignored).
 */
export function nativeHttpFor(plugin: NativeHttpPlugin, allowed: readonly string[]): FetchFn {
  return async (url, init) => {
    if (!allowed.some((a) => url === a || url.startsWith(`${a}/`))) throw new TypeError('blocked');
    const signal = init.signal;
    if (signal?.aborted) throw aborted();
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let data: unknown;
    if (typeof init.body === 'string') {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    }
    const request = plugin.request({ url, method: init.method ?? 'GET', headers, data, responseType: 'text' });
    const res = signal
      ? await Promise.race([request, new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(aborted()), { once: true }))])
      : await request;
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? null);
    return new Response(text, { status: res.status });
  };
}

/** Native HTTP for app-only providers in the app; null in the browser build. */
export function nativeHttp(native = isNativeApp()): FetchFn | null {
  const allowed = appDirectEndpoints();
  if (!native || allowed.length === 0) return null;
  return nativeHttpFor(CapacitorHttp as unknown as NativeHttpPlugin, allowed);
}

/** Native OnDeviceAi plugin (android/app/src/main/java/.../OnDeviceAiPlugin.java). */
export interface OnDeviceAiPlugin {
  status(): Promise<DeviceAiInfo>;
  download(): Promise<void>;
  generate(req: { system: string; user: string; maxTokens: number }): Promise<{ text: string }>;
  addListener(event: 'downloadProgress', fn: (e: { bytes: number }) => void): Promise<PluginListenerHandle>;
}

/** Bridge over the plugin. Rejections keep only the plugin's fixed cause code. */
export function deviceAiBridgeFor(plugin: OnDeviceAiPlugin, platform: DeviceAiBridge['platform']): DeviceAiBridge {
  return {
    platform,
    status: () => plugin.status(),
    download: async (onProgress) => {
      const handle = await plugin.addListener('downloadProgress', (e) => onProgress?.(e.bytes));
      try {
        await plugin.download();
      } finally {
        await handle.remove();
      }
    },
    generate: async (req) => (await plugin.generate(req)).text,
  };
}

/** On-device AI bridge in the app on a platform with the plugin; null in the browser build. */
export function nativeDeviceAi(): DeviceAiBridge | null {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('OnDeviceAi')) return null;
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;
  return deviceAiBridgeFor(registerPlugin<OnDeviceAiPlugin>('OnDeviceAi'), platform);
}

export type CoffeeResult = 'thanks' | 'pending' | 'cancelled';
export type CoffeeFailure = 'network' | 'unavailable' | 'busy' | 'unknown';

/** Native Coffee plugin (android/app/src/main/java/.../CoffeePlugin.java, Google Play Billing). */
export interface CoffeePlugin {
  product(o: { productId: string }): Promise<{ available: boolean; price?: string }>;
  buy(o: { productId: string }): Promise<{ result: CoffeeResult }>;
}

export interface CoffeeBridge {
  product(): Promise<{ available: boolean; price?: string }>;
  buy(): Promise<CoffeeResult>;
}

const COFFEE_FAILURES: readonly string[] = ['network', 'unavailable', 'busy', 'unknown'];

/** Fixed failure code of a plugin rejection (anything else is 'unknown'). */
export function coffeeFailure(err: unknown): CoffeeFailure {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
  return typeof code === 'string' && COFFEE_FAILURES.includes(code) ? (code as CoffeeFailure) : 'unknown';
}

export function coffeeBridgeFor(plugin: CoffeePlugin, productId: string): CoffeeBridge {
  return {
    product: async () => {
      const r = await plugin.product({ productId });
      return { available: r.available === true, price: typeof r.price === 'string' ? r.price : undefined };
    },
    buy: async () => {
      const { result } = await plugin.buy({ productId });
      return result === 'thanks' || result === 'pending' ? result : 'cancelled';
    },
  };
}

/** Coffee purchase in the app on a configured platform with the plugin; null elsewhere (DESIGN 3.17). */
export function nativeCoffee(cfg: { product_id: string; platforms: readonly string[] }): CoffeeBridge | null {
  if (!isNativeApp() || !Capacitor.isPluginAvailable('Coffee')) return null;
  if (!cfg.platforms.includes(Capacitor.getPlatform())) return null;
  return coffeeBridgeFor(registerPlugin<CoffeePlugin>('Coffee'), cfg.product_id);
}

/** App version shown on the About screen (package.json, injected at build time). */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * Launch splash (DESIGN 3.17). In the app the native launch splash stays until the web app says it is
 * ready, so the web splash in index.html needs no minimum time there; in the browser it shows for a
 * moment so it reads as a screen, not a flicker.
 */
export const WEB_SPLASH_MIN_MS = 600;

export function webSplashMinMs(native = isNativeApp()): number {
  return native ? 0 : WEB_SPLASH_MIN_MS;
}

interface ShellPlugin {
  ready(): Promise<void>;
  exit(): Promise<void>;
  saveDownload(o: { name: string; text: string }): Promise<{ name: string }>;
  email(o: { subject: string; text: string; chooser: string }): Promise<void>;
  addListener(event: 'back', fn: () => void): Promise<PluginListenerHandle>;
}

const shell = (native: boolean): ShellPlugin | null =>
  native && Capacitor.isPluginAvailable('Shell') ? registerPlugin<ShellPlugin>('Shell') : null;

/** Tell the native launch splash that the first screen has rendered; nothing in the browser. */
export async function signalLaunchReady(native = isNativeApp()): Promise<void> {
  await shell(native)?.ready();
}

/**
 * Android back key/gesture → the window event `app:back` (src/app/back.ts). Returns how to leave the
 * app when there is nothing left to go back to; null in the browser (its own back button walks history).
 */
export async function connectBackKey(eventName: string, native = isNativeApp()): Promise<(() => void) | null> {
  const plugin = shell(native);
  if (!plugin) return null;
  await plugin.addListener('back', () => window.dispatchEvent(new Event(eventName)));
  return () => void plugin.exit();
}
