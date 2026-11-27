import type { FlagKey } from '../telemetry/events.js';
import { SELLER_IDS, sellerFlagKey, type SellerId } from './ids.js';

export type SellerEnablement = Record<
  SellerId,
  { enabled: boolean; source: 'config' | 'flag' | 'default' }
>;

/** The Telemetry facade satisfies this structurally. */
export interface FlagReader {
  getFeatureFlag(key: FlagKey, fallback: boolean): Promise<boolean>;
}

/**
 * Config decides; a feature flag overrides when it differs from the config value.
 * A seller with no config row defaults to disabled (a seller with no row never scrapes).
 */
export async function resolveSellerEnablement(
  config: Partial<Record<SellerId, boolean>>,
  flags: FlagReader,
): Promise<SellerEnablement> {
  const entries = await Promise.all(
    SELLER_IDS.map(async (id) => {
      const configured = config[id];
      const base = configured ?? false;
      const baseSource = configured === undefined ? 'default' : 'config';
      let value: boolean;
      try {
        value = await flags.getFeatureFlag(sellerFlagKey(id), base);
      } catch {
        value = base;
      }
      const result =
        value !== base
          ? { enabled: value, source: 'flag' as const }
          : { enabled: base, source: baseSource };
      return [id, result] as const;
    }),
  );
  return Object.fromEntries(entries) as SellerEnablement;
}
