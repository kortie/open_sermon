// S15: on-device AI bridge → LlmClient (DESIGN 3.6.1). Fixed cause codes only, timeout and cancel
// settle at once, enabled flag default off, client only when turned on and the model is available.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceClient,
  deviceAiStatus,
  deviceCause,
  deviceClient,
  deviceModel,
  isDeviceAiEnabled,
  setDeviceAiBridge,
  setDeviceAiEnabled,
  type DeviceAiBridge,
  type DeviceAiInfo,
} from '../../../src/core/llm/device';
import { LlmError } from '../../../src/core/llm/types';
import { openDb } from '../../../src/core/store/db';

let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`device-ai-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  setDeviceAiBridge(null);
  vi.useRealTimers();
});

function bridge(over: Partial<DeviceAiBridge> = {}, info: DeviceAiInfo = { status: 'available' }): DeviceAiBridge {
  return {
    platform: 'android',
    status: async () => info,
    download: async () => undefined,
    generate: async () => '{"examples":[]}',
    ...over,
  };
}

const causeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LlmError);
    return (e as LlmError).cause;
  }
  throw new Error('resolved');
};

describe('deviceCause', () => {
  it('maps the native codes to the fixed causes', () => {
    expect(['busy', 'quota', 'background'].map(deviceCause)).toEqual(['device_busy', 'device_busy', 'device_busy']);
    expect(deviceCause('too_large')).toBe('device_too_long');
    expect(['unavailable', 'disk'].map(deviceCause)).toEqual(['device_unavailable', 'device_unavailable']);
    expect([undefined, 'cancelled', 'whatever', 5].map(deviceCause)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });
});

describe('createDeviceClient', () => {
  it('passes system, user and a capped token limit; returns the text', async () => {
    const gen = vi.fn(async () => 'answer');
    const c = createDeviceClient(bridge({ generate: gen }));
    await expect(c.generate('S', 'U', { maxTokens: 99999 })).resolves.toBe('answer');
    expect(gen).toHaveBeenCalledWith({ system: 'S', user: 'U', maxTokens: 512 });
  });

  it('a native rejection becomes an LlmError with the mapped cause only', async () => {
    const c = createDeviceClient(bridge({ generate: async () => Promise.reject(Object.assign(new Error('on-device: busy secret prompt'), { code: 'busy' })) }));
    const err = await c.generate('S', 'U').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).cause).toBe('device_busy');
    expect(String((err as Error).message)).not.toContain('secret');
  });

  it('times out', async () => {
    vi.useFakeTimers();
    const c = createDeviceClient(bridge({ generate: () => new Promise(() => undefined) }), 1000);
    const p = causeOf(c.generate('S', 'U'));
    await vi.advanceTimersByTimeAsync(1001);
    await expect(p).resolves.toBe('timeout');
  });

  it('a cancel settles at once; an already aborted signal never calls the OS', async () => {
    const gen = vi.fn(() => new Promise<string>(() => undefined));
    const c = createDeviceClient(bridge({ generate: gen }));
    const ac = new AbortController();
    const p = causeOf(c.generate('S', 'U', { signal: ac.signal }));
    ac.abort();
    await expect(p).resolves.toBe('unknown');
    const done = new AbortController();
    done.abort();
    await expect(causeOf(c.generate('S', 'U', { signal: done.signal }))).resolves.toBe('unknown');
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it('a non-string answer is unknown', async () => {
    const c = createDeviceClient(bridge({ generate: async () => undefined as unknown as string }));
    await expect(causeOf(c.generate('S', 'U'))).resolves.toBe('unknown');
  });

  it('validateKey passes only when the model is available', async () => {
    await expect(createDeviceClient(bridge()).validateKey()).resolves.toBeUndefined();
    await expect(causeOf(createDeviceClient(bridge({}, { status: 'downloadable' })).validateKey())).resolves.toBe('device_unavailable');
  });
});

describe('status, enabled flag and deviceClient', () => {
  it('status: unavailable without a bridge, on a failing check or an unknown value', async () => {
    expect(await deviceAiStatus(null)).toEqual({ status: 'unavailable' });
    expect(await deviceAiStatus(bridge({ status: async () => Promise.reject(new Error('x')) }))).toEqual({ status: 'unavailable' });
    expect(await deviceAiStatus(bridge({}, { status: 'weird' as never }))).toEqual({ status: 'unavailable' });
    expect(await deviceAiStatus(bridge({}, { status: 'downloadable', tokenLimit: 4000 }))).toEqual({ status: 'downloadable', tokenLimit: 4000 });
  });

  it('model id per platform; empty without a bridge', () => {
    expect(deviceModel(null)).toBe('');
    expect(deviceModel(bridge())).toBe('gemini-nano');
    expect(deviceModel(bridge({ platform: 'ios' }))).toBe('apple-foundation');
  });

  it('off by default; a client only with bridge + turned on + available', async () => {
    const db = await fresh();
    expect(await isDeviceAiEnabled(db)).toBe(false);
    expect(await deviceClient(db)).toBeNull(); // no bridge

    setDeviceAiBridge(bridge());
    expect(await deviceClient(db)).toBeNull(); // off
    await setDeviceAiEnabled(true, db);
    expect(await isDeviceAiEnabled(db)).toBe(true);
    expect(await deviceClient(db)).not.toBeNull();

    setDeviceAiBridge(bridge({}, { status: 'downloadable' }));
    expect(await deviceClient(db)).toBeNull(); // not downloaded

    setDeviceAiBridge(bridge());
    await setDeviceAiEnabled(false, db);
    expect(await deviceClient(db)).toBeNull();
  });
});
