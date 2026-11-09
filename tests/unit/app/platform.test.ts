// S13: platform branch for file exports (DESIGN 2.1.2). Browser → download; app → app cache file
// handed to the share sheet; a closed share sheet is "cancelled", not an error.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appDirectEndpoints, coffeeBridgeFor, coffeeFailure, isNativeApp, nativeCoffee, nativeHttp, nativeHttpFor, saveFile, saveTextFile, sendTextByEmail, toBase64, type NativeFileApi, type NativeHttpPlugin, type TextExportApi } from '../../../src/app/platform';
import { providers } from '../../../config/app.config.json';

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

// S16: coffee purchase bridge (DESIGN 3.17). Only fixed result/failure codes cross the bridge.
describe('coffee bridge', () => {
  it('is absent in the browser build', () => {
    expect(nativeCoffee({ product_id: 'coffee', platforms: ['android'] })).toBeNull();
  });

  it('passes the configured product id and keeps only known fields', async () => {
    const seen: string[] = [];
    const bridge = coffeeBridgeFor(
      {
        product: async ({ productId }) => {
          seen.push(`product ${productId}`);
          return { available: true, price: '₩1,500', extra: 'x' } as { available: boolean; price?: string };
        },
        buy: async ({ productId }) => {
          seen.push(`buy ${productId}`);
          return { result: 'thanks' };
        },
      },
      'coffee',
    );
    expect(await bridge.product()).toEqual({ available: true, price: '₩1,500' });
    expect(await bridge.buy()).toBe('thanks');
    expect(seen).toEqual(['product coffee', 'buy coffee']);
  });

  it('treats an unexpected product answer as unavailable and an unknown result as cancelled', async () => {
    const bridge = coffeeBridgeFor(
      {
        product: async () => ({ available: 'yes', price: 3 }) as unknown as { available: boolean },
        buy: async () => ({ result: 'weird' }) as unknown as { result: 'thanks' },
      },
      'coffee',
    );
    expect(await bridge.product()).toEqual({ available: false, price: undefined });
    expect(await bridge.buy()).toBe('cancelled');
  });

  it('pending stays pending', async () => {
    const bridge = coffeeBridgeFor({ product: async () => ({ available: true }), buy: async () => ({ result: 'pending' }) }, 'coffee');
    expect(await bridge.buy()).toBe('pending');
  });

  it('maps rejections to fixed failure codes', () => {
    expect(coffeeFailure({ code: 'network', message: 'x' })).toBe('network');
    expect(coffeeFailure({ code: 'unavailable' })).toBe('unavailable');
    expect(coffeeFailure({ code: 'busy' })).toBe('busy');
    expect(coffeeFailure({ code: 'something-else' })).toBe('unknown');
    expect(coffeeFailure(new Error('boom'))).toBe('unknown');
    expect(coffeeFailure(null)).toBe('unknown');
  });
});

// S16: one launch splash (DESIGN 3.17). The app relies on the native splash, the browser on index.html.
describe('launch splash', () => {
  it('web splash minimum only in the browser', async () => {
    const { webSplashMinMs, WEB_SPLASH_MIN_MS } = await import('../../../src/app/platform');
    expect(webSplashMinMs(false)).toBe(WEB_SPLASH_MIN_MS);
    expect(webSplashMinMs(true)).toBe(0);
    expect(webSplashMinMs()).toBe(WEB_SPLASH_MIN_MS);
  });

  it('ready signal is a no-op without the native plugin', async () => {
    const { signalLaunchReady } = await import('../../../src/app/platform');
    await expect(signalLaunchReady()).resolves.toBeUndefined();
    await expect(signalLaunchReady(true)).resolves.toBeUndefined();
  });
});

const coded = (code: string) => Object.assign(new Error(code), { code });

describe('saveTextFile (generation result)', () => {
  it('app: straight into the Download folder, reporting the name the system kept', async () => {
    const saveDownload = vi.fn<NonNullable<TextExportApi['saveDownload']>>(async () => ({ name: 'a (1).txt' }));
    const { api: fileApi, calls } = fakeApi();
    await expect(saveTextFile('a.txt', '가나', { native: true, api: { saveDownload }, fileApi })).resolves.toEqual({ kind: 'downloads', name: 'a (1).txt' });
    expect(saveDownload).toHaveBeenCalledWith('a.txt', '가나');
    expect(calls).toEqual([]);
  });

  it('app on an older Android (unsupported) or without the call: the share sheet with the file', async () => {
    const { api: fileApi, calls } = fakeApi();
    const saveDownload = async () => Promise.reject(coded('unsupported'));
    await expect(saveTextFile('a.txt', '가나', { native: true, api: { saveDownload }, fileApi })).resolves.toEqual({ kind: 'saved' });
    expect(calls).toEqual([`write exports/a.txt ${toBase64(new TextEncoder().encode('가나'))}`, 'share a.txt file:///cache/exports/a.txt']);
    const ios = fakeApi(async () => {
      throw new Error('Share canceled');
    });
    await expect(saveTextFile('a.txt', 'x', { native: true, api: {}, fileApi: ios.api })).resolves.toEqual({ kind: 'cancelled' });
  });

  it('app: a failed save is thrown, not hidden behind the share sheet', async () => {
    const { api: fileApi, calls } = fakeApi();
    await expect(saveTextFile('a.txt', 'x', { native: true, api: { saveDownload: async () => Promise.reject(coded('failed')) }, fileApi })).rejects.toThrow('failed');
    expect(calls).toEqual([]);
  });

  it('browser: a download, never the app calls', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:t'), revokeObjectURL: vi.fn() });
    const saveDownload = vi.fn();
    await expect(saveTextFile('a.txt', 'x', { native: false, api: { saveDownload } })).resolves.toEqual({ kind: 'saved' });
    expect(saveDownload).not.toHaveBeenCalled();
  });
});

describe('sendTextByEmail', () => {
  it('app: the email app chooser with subject and body', async () => {
    const email = vi.fn<NonNullable<TextExportApi['email']>>(async () => undefined);
    const shareText = vi.fn();
    await expect(sendTextByEmail('제목', '본문', '메일 앱', { native: true, api: { email, shareText } })).resolves.toBe('opened');
    expect(email).toHaveBeenCalledWith('제목', '본문', '메일 앱');
    expect(shareText).not.toHaveBeenCalled();
  });

  it('app without an email app (or iOS): the share sheet; closing it is "cancelled"', async () => {
    const shareText = vi.fn<NonNullable<TextExportApi['shareText']>>(async () => undefined);
    await expect(sendTextByEmail('s', 't', 'c', { native: true, api: { email: async () => Promise.reject(coded('no_app')), shareText } })).resolves.toBe('opened');
    expect(shareText).toHaveBeenCalledWith('s', 't');
    await expect(sendTextByEmail('s', 't', 'c', { native: true, api: { shareText: async () => Promise.reject(new Error('Share canceled')) } })).resolves.toBe('cancelled');
    await expect(sendTextByEmail('s', 't', 'c', { native: true, api: { email: async () => Promise.reject(coded('weird')), shareText } })).rejects.toThrow('weird');
  });

  it('browser: the system share when there is one, otherwise a mailto: link with encoded subject and body', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await expect(sendTextByEmail('제목', '본문', 'c', { native: false, api: {} })).resolves.toBe('opened');
    expect(share).toHaveBeenCalledWith({ title: '제목', text: '본문' });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const loc = { href: '' };
    vi.spyOn(window, 'location', 'get').mockReturnValue(loc as Location);
    await expect(sendTextByEmail('a&b', '줄1\n줄2', 'c', { native: false, api: {} })).resolves.toBe('opened');
    expect(loc.href).toBe(`mailto:?subject=a%26b&body=${encodeURIComponent('줄1\n줄2')}`);
  });
});

describe('native HTTP (OpenAI in the app)', () => {
  const ENDPOINT = 'https://api.example.test/v1/responses';
  const plugin = (res: { status: number; data: unknown } | (() => Promise<{ status: number; data: unknown }>)) => {
    const request = vi.fn<NativeHttpPlugin['request']>(typeof res === 'function' ? res : async () => res);
    return { request };
  };

  it('endpoints come from app_direct_verified providers only (OpenAI in the repository config)', () => {
    expect(appDirectEndpoints()).toEqual([providers.openai.endpoint]);
    expect(
      appDirectEndpoints({
        a: { endpoint: 'https://a.test/x', browser_direct_verified: true, app_direct_verified: true },
        b: { endpoint: 'ftp://b.test/x', browser_direct_verified: false, app_direct_verified: true },
        c: { endpoint: '<placeholder>', browser_direct_verified: false, app_direct_verified: true },
        d: { endpoint: 'https://d.test/x', browser_direct_verified: false },
      }),
    ).toEqual([]);
    expect(nativeHttp(false)).toBeNull();
  });

  it('sends JSON bodies as data with the headers, and returns the status and body as a Response', async () => {
    const p = plugin({ status: 401, data: '{"error":{"message":"bad"}}' });
    const res = await nativeHttpFor(p, [ENDPOINT])(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer k', 'content-type': 'application/json' }, body: '{"a":1}' });
    expect(p.request).toHaveBeenCalledWith({ url: ENDPOINT, method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, data: { a: 1 }, responseType: 'text' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { message: 'bad' } });
    const obj = plugin({ status: 200, data: { ok: true } });
    expect(await (await nativeHttpFor(obj, [ENDPOINT])(`${ENDPOINT}/x`, { method: 'GET' })).json()).toEqual({ ok: true });
  });

  it('any other URL fails before a request (native calls are outside the page CSP)', async () => {
    const p = plugin({ status: 200, data: '' });
    const send = nativeHttpFor(p, [ENDPOINT]);
    for (const url of ['https://evil.test/v1/responses', `${ENDPOINT}x`, 'https://api.example.test/v1/files', 'ftp://api.example.test/v1/responses']) {
      await expect(send(url, { method: 'POST' })).rejects.toThrow('blocked');
    }
    expect(p.request).not.toHaveBeenCalled();
  });

  it('a cancel settles at once; an already cancelled request is never sent', async () => {
    const p = plugin(() => new Promise(() => undefined));
    const send = nativeHttpFor(p, [ENDPOINT]);
    const ac = new AbortController();
    const pending = send(ENDPOINT, { method: 'POST', signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const done = new AbortController();
    done.abort();
    await expect(send(ENDPOINT, { method: 'POST', signal: done.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(p.request).toHaveBeenCalledTimes(1);
  });
});
