import { describe, expect, it } from 'vitest';
import { SELLER_IDS } from '../sellers/ids.js';
import { SEED, SeedSchema } from './seed-data.js';

describe('SEED', () => {
  it('passes SeedSchema', () => {
    expect(SeedSchema.safeParse(SEED).success).toBe(true);
  });

  it('describes the Rixos Radamis search', () => {
    expect(SEED.search).toMatchObject({
      slug: 'rixos-radamis-may-2027',
      nights: 7,
      departFrom: '2027-05-03',
      departTo: '2027-05-31',
      maxPricePence: null,
    });
    expect(SEED.search.alertRules).toEqual({
      bestDropPence: 5000,
      brsWithinBhxPence: 15000,
      newDealMinPence: 5000,
      dealExpiryHours: 24,
    });
  });

  it('has the base and optional three-adult party variants', () => {
    expect(SEED.parties).toEqual([
      { variant: 'base', adults: 2, childAges: [4], infants: 1, active: true },
      { variant: 'three_adults', adults: 3, childAges: [4], infants: 1, active: false },
    ]);
  });

  it('prefers BRS over BHX', () => {
    expect(SEED.airports).toEqual([
      { airportCode: 'BRS', preference: 1 },
      { airportCode: 'BHX', preference: 2 },
    ]);
  });

  it('has the airport costs in integer pence', () => {
    const by = Object.fromEntries(SEED.airportCosts.map((a) => [a.airportCode, a]));
    expect(by.BHX).toMatchObject({
      travelMode: 'car',
      travelCostPence: 3500,
      parkingCostPence: 10000,
      driveHomeMinutes: 90,
      overnightHotelPence: 9000,
    });
    expect(by.BRS).toMatchObject({
      travelMode: 'bus',
      travelCostPence: 3000,
      parkingCostPence: 0,
      driveHomeMinutes: 30,
      overnightHotelPence: 9000,
    });
  });

  it('has three room setups whose occupancy sums to the base party', () => {
    expect(SEED.roomSetups.map((r) => r.key)).toEqual([
      'cheapest_standard',
      'two_standard',
      'family',
    ]);
    for (const r of SEED.roomSetups) {
      expect(r.occupancy).toHaveLength(r.rooms);
      expect(r.occupancy.reduce((n, o) => n + o.adults, 0)).toBe(2);
      expect(r.occupancy.flatMap((o) => o.childAges)).toEqual([4]);
      expect(r.occupancy.reduce((n, o) => n + o.infants, 0)).toBe(1);
    }
    expect(SEED.roomSetups.find((r) => r.key === 'family')?.roomType).toBe('family');
  });

  it('seeds all four sellers enabled', () => {
    expect(SEED.sellers.map((s) => s.id)).toEqual([...SELLER_IDS]);
    expect(SEED.sellers.every((s) => s.enabled)).toBe(true);
    expect(SEED.sellers.map((s) => s.displayName)).toEqual([
      'Jet2holidays',
      'TUI',
      'On the Beach',
      'easyJet holidays',
    ]);
  });

  it('rejects a non-integer pence value', () => {
    const bad = structuredClone(SEED);
    bad.airportCosts[0]!.travelCostPence = 35.5;
    expect(SeedSchema.safeParse(bad).success).toBe(false);
  });
});
