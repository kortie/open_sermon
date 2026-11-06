// On-device OS AI (DESIGN 3.6.1, S15): Android ML Kit GenAI Prompt API (Gemini Nano in AICore),
// iOS Foundation Models. The native side is reached through a bridge the app installs at start
// (src/app/platform.ts); core never imports Capacitor. There is no key and no endpoint: the prompt
// and the answer stay on the device. The model is downloaded by the OS only when the user taps
// "download" (never automatically). Used only while no provider key is connected, and only for
// the short kinds (config on_device_ai.kinds).
import { on_device_ai } from '../../../config/app.config.json';
import { getAllSettings, setSettings } from '../store/settings';
import { LlmError, type GenerateOptions, type LlmCause, type LlmClient } from './types';

export type DeviceAiStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface DeviceAiInfo {
  status: DeviceAiStatus;
  /** Input + output token limit reported by the OS, when known. */
  tokenLimit?: number;
}

/** Native side (one implementation per platform). Rejections carry a fixed cause code only. */
export interface DeviceAiBridge {
  platform: 'android' | 'ios';
  status(): Promise<DeviceAiInfo>;
  /** Starts the OS model download; resolves when it is done. */
  download(onProgress?: (bytes: number) => void): Promise<void>;
  generate(req: { system: string; user: string; maxTokens: number }): Promise<string>;
}

export type DeviceKind = 'example' | 'one_liner';
export const DEVICE_KINDS: readonly string[] = on_device_ai.kinds;
export const DEVICE_PROVIDER = 'device';

let bridge: DeviceAiBridge | null = null;

/** Installed once by the app (null in the browser build and in tests unless a test sets one). */
export function setDeviceAiBridge(b: DeviceAiBridge | null): void {
  bridge = b;
}

export function deviceAiBridge(): DeviceAiBridge | null {
  return bridge;
}

const STATUSES: readonly string[] = ['available', 'downloadable', 'downloading', 'unavailable'];

/** Current OS status; 'unavailable' without a bridge or when the check fails. */
export async function deviceAiStatus(b: DeviceAiBridge | null = bridge): Promise<DeviceAiInfo> {
  if (!b) return { status: 'unavailable' };
  try {
    const info = await b.status();
    return STATUSES.includes(info.status) ? info : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/** The user turned on-device AI on in settings (default off). */
export async function isDeviceAiEnabled(db?: IDBDatabase): Promise<boolean> {
  const raw = await getAllSettings(db);
  return raw.device_ai_enabled === true;
}

export async function setDeviceAiEnabled(on: boolean, db?: IDBDatabase): Promise<void> {
  await setSettings({ device_ai_enabled: on }, db);
}

/** Model id shown in result meta (config on_device_ai.models). */
export function deviceModel(b: DeviceAiBridge | null = bridge): string {
  return b ? on_device_ai.models[b.platform] : '';
}

/** Native cause code → LlmCause (DESIGN 3.13.3 table, device rows). */
export function deviceCause(code: unknown): LlmCause {
  switch (code) {
    case 'busy':
    case 'quota':
    case 'background':
      return 'device_busy';
    case 'too_large':
      return 'device_too_long';
    case 'unavailable':
    case 'disk':
      return 'device_unavailable';
    default:
      return 'unknown';
  }
}

const codeOf = (err: unknown): unknown => (typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined);

/** LlmClient over the bridge. A cancel or the timeout settles the promise at once; the OS call
 *  itself cannot be stopped and its answer is dropped. */
export function createDeviceClient(b: DeviceAiBridge, timeoutMs = on_device_ai.timeout_seconds * 1000): LlmClient {
  return {
    async generate(system: string, user: string, opts: GenerateOptions = {}): Promise<string> {
      if (opts.signal?.aborted) throw new LlmError('unknown');
      const maxTokens = Math.min(opts.maxTokens ?? on_device_ai.max_output_tokens, on_device_ai.max_output_tokens);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const stop = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LlmError('timeout')), timeoutMs);
        onAbort = () => reject(new LlmError('unknown'));
        opts.signal?.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const call = b.generate({ system, user, maxTokens }).catch((err: unknown) => {
          throw new LlmError(deviceCause(codeOf(err)));
        });
        const text = await Promise.race([call, stop]);
        if (typeof text !== 'string') throw new LlmError('unknown');
        return text;
      } finally {
        clearTimeout(timer);
        if (onAbort) opts.signal?.removeEventListener('abort', onAbort);
      }
    },
    async validateKey(): Promise<void> {
      if ((await deviceAiStatus(b)).status !== 'available') throw new LlmError('device_unavailable');
    },
  };
}

/** A client when on-device AI can be used now: bridge present, turned on, model available. */
export async function deviceClient(db?: IDBDatabase): Promise<LlmClient | null> {
  const b = bridge;
  if (!b) return null;
  if (!(await isDeviceAiEnabled(db).catch(() => false))) return null;
  if ((await deviceAiStatus(b)).status !== 'available') return null;
  return createDeviceClient(b);
}
