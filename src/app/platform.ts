// Browser vs. Capacitor app differences (DESIGN 2.1.2, v0.18; S13). The only place that branches
// on the platform. Files are never sent anywhere by the app: in the browser they are downloaded,
// in the app they are written to the app's cache folder and handed to the system share sheet, where
// the user picks where to save or send them.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { DeviceAiBridge, DeviceAiInfo } from '../core/llm';

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
