// S13: platform branch for file exports (DESIGN 2.1.2). Browser → download; app → app cache file
// handed to the share sheet; a closed share sheet is "cancelled", not an error.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp, saveFile, toBase64, type NativeFileApi } from '../../../src/app/platform';

afterEach(() => vi.restoreAllMocks());

const fakeApi = (share: NativeFileApi['share'] = async () => undefined) => {
  const calls: string[] = [];
  const api: NativeFileApi = {
    write: async (path, data) => {
      calls.push(`write ${path} ${data}`);
      return `file:///cache/${path}`;
    },
    share: async (title, uri) => {
      calls.push(`share ${title} ${uri}`);
      return share(title, uri);
    },
  };
  return { api, calls };
};

describe('saveFile', () => {
  it('is a plain web page under test (not the native app)', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('browser: downloads through a temporary link and never calls the app file API', async () => {
    const clicks: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download });
    });
    const create = vi.fn(() => 'blob:test');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const { api, calls } = fakeApi();
    await expect(saveFile('a.txt', new Blob(['x']), { native: false, api })).resolves.toBe('saved');
    expect(clicks).toEqual([{ href: 'blob:test', download: 'a.txt' }]);
    expect(calls).toEqual([]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('app: writes the bytes (base64) to the cache, then opens the share sheet with that file', async () => {
    const { api, calls } = fakeApi();
    await expect(saveFile('backup.osb', new Blob(['가나'], { type: 'application/octet-stream' }), { native: true, api })).resolves.toBe('saved');
    const b64 = toBase64(new TextEncoder().encode('가나'));
    expect(calls).toEqual([`write exports/backup.osb ${b64}`, 'share backup.osb file:///cache/exports/backup.osb']);
  });

  it('app: closing the share sheet is "cancelled"; other failures are thrown', async () => {
    const cancelled = fakeApi(async () => {
      throw new Error('Share canceled');
    });
    await expect(saveFile('a.txt', new Blob(['x']), { native: true, api: cancelled.api })).resolves.toBe('cancelled');
    const broken = fakeApi(async () => {
      throw new Error('No activity found');
    });
    await expect(saveFile('a.txt', new Blob(['x']), { native: true, api: broken.api })).rejects.toThrow('No activity');
  });

  it('base64 of large data matches the reference encoding (chunked)', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('on-device AI bridge (S15)', () => {
  it('browser build: no bridge', async () => {
    const { nativeDeviceAi } = await import('../../../src/app/platform');
    expect(nativeDeviceAi()).toBeNull();
  });

  it('wraps the plugin: status, generate text, download progress with the listener removed', async () => {
    const { deviceAiBridgeFor } = await import('../../../src/app/platform');
    const removed = vi.fn(async () => undefined);
    let listener: ((e: { bytes: number }) => void) | undefined;
    const plugin = {
      status: vi.fn(async () => ({ status: 'downloadable' as const })),
      download: vi.fn(async () => {
        listener?.({ bytes: 42 });
      }),
      generate: vi.fn(async () => ({ text: 'T' })),
      addListener: vi.fn(async (_e: 'downloadProgress', fn: (e: { bytes: number }) => void) => {
        listener = fn;
        return { remove: removed };
      }),
    };
    const b = deviceAiBridgeFor(plugin, 'android');
    expect(b.platform).toBe('android');
    expect(await b.status()).toEqual({ status: 'downloadable' });
    expect(await b.generate({ system: 's', user: 'u', maxTokens: 5 })).toBe('T');
    const seen: number[] = [];
    await b.download((x) => seen.push(x));
    expect(seen).toEqual([42]);
    expect(removed).toHaveBeenCalledTimes(1);

    plugin.download.mockRejectedValueOnce(new Error('x'));
    await expect(b.download()).rejects.toThrow('x');
    expect(removed).toHaveBeenCalledTimes(2);
  });
});
