import { describe, expect, it, vi } from 'vitest';
import { resolveSellerEnablement, type FlagReader } from './enablement.js';

const config = { jet2: true, tui: false, on_the_beach: true, easyjet_holidays: true };
const echo: FlagReader = { getFeatureFlag: (_key, fallback) => Promise.resolve(fallback) };

describe('resolveSellerEnablement', () => {
  it('returns the config with source config when flags echo the fallback', async () => {
    const result = await resolveSellerEnablement(config, echo);
    expect(result).toEqual({
      jet2: { enabled: true, source: 'config' },
      tui: { enabled: false, source: 'config' },
      on_the_beach: { enabled: true, source: 'config' },
      easyjet_holidays: { enabled: true, source: 'config' },
    });
  });

  it('lets a flag disable a configured-enabled seller', async () => {
    const flags: FlagReader = {
      getFeatureFlag: (key, fallback) =>
        Promise.resolve(key === 'seller_jet2_enabled' ? false : fallback),
    };
    expect((await resolveSellerEnablement(config, flags)).jet2).toEqual({
      enabled: false,
      source: 'flag',
    });
  });

  it('lets a flag enable a configured-disabled seller', async () => {
    const flags: FlagReader = {
      getFeatureFlag: (key, fallback) =>
        Promise.resolve(key === 'seller_tui_enabled' ? true : fallback),
    };
    expect((await resolveSellerEnablement(config, flags)).tui).toEqual({
      enabled: true,
      source: 'flag',
    });
  });

  it('defaults a seller missing from config to disabled', async () => {
    const result = await resolveSellerEnablement({ jet2: true }, echo);
    expect(result.tui).toEqual({ enabled: false, source: 'default' });
    expect(result.jet2).toEqual({ enabled: true, source: 'config' });
  });

  it('reads the flag once per seller using sellerFlagKey', async () => {
    const getFeatureFlag = vi.fn((_key: string, fallback: boolean) => Promise.resolve(fallback));
    await resolveSellerEnablement(config, { getFeatureFlag });
    expect(getFeatureFlag).toHaveBeenCalledTimes(4);
    expect(getFeatureFlag.mock.calls.map((c) => c[0]).sort()).toEqual([
      'seller_easyjet_holidays_enabled',
      'seller_jet2_enabled',
      'seller_on_the_beach_enabled',
      'seller_tui_enabled',
    ]);
  });

  it('falls back to config when the flag reader rejects', async () => {
    const flags: FlagReader = { getFeatureFlag: () => Promise.reject(new Error('down')) };
    const result = await resolveSellerEnablement(config, flags);
    expect(result.jet2).toEqual({ enabled: true, source: 'config' });
    expect(result.tui).toEqual({ enabled: false, source: 'config' });
  });
});
