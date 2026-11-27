/** Integer pence. Money is never a float. */
export type Pence = number & { readonly __brand: 'Pence' };

export function pence(n: number): Pence {
  if (!Number.isInteger(n)) {
    throw new RangeError(`pence must be an integer, got ${String(n)}`);
  }
  return n as Pence;
}

/** Whether a seller's headline price is for the whole party or per person. */
export type PriceBasis = 'total' | 'per_person';

export type TriState = 'included' | 'extra' | 'unknown';

/**
 * Who sleeps in one room. Infants are under 2 and on a lap. Seller encoders
 * (Phase 3) translate this, e.g. Jet2 encodes an infant as child age 1.
 */
export interface RoomOccupancy {
  adults: number;
  childAges: number[];
  infants: number;
}

export interface PartyComposition {
  adults: number;
  childAges: number[];
  infants: number;
}
