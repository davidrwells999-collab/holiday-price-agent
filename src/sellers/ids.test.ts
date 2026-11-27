import { describe, expect, it } from 'vitest';
import { SELLER_IDS, isSellerId, sellerFlagKey } from './ids.js';

describe('seller ids', () => {
  it('lists the four sellers in order', () => {
    expect(SELLER_IDS).toEqual(['jet2', 'tui', 'on_the_beach', 'easyjet_holidays']);
  });

  it('builds the feature flag key', () => {
    expect(sellerFlagKey('on_the_beach')).toBe('seller_on_the_beach_enabled');
  });

  it('recognises valid and invalid ids', () => {
    expect(isSellerId('jet2')).toBe(true);
    expect(isSellerId('ryanair')).toBe(false);
    expect(isSellerId('')).toBe(false);
  });
});
