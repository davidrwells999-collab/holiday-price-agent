import { z } from 'zod';
import { SELLER_IDS } from '../sellers/ids.js';

const Occupancy = z.object({
  adults: z.number().int().min(1),
  childAges: z.array(z.number().int().min(2).max(17)),
  infants: z.number().int().min(0),
});

export const SeedSchema = z.object({
  search: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    hotelName: z.string().min(1),
    hotelLocation: z.string().min(1),
    boardBasis: z.string().min(1),
    nights: z.number().int().positive(),
    departFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    departTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxPricePence: z.number().int().positive().nullable(),
    alertRules: z.object({
      bestDropPence: z.number().int().nonnegative(),
      brsWithinBhxPence: z.number().int().nonnegative(),
      newDealMinPence: z.number().int().nonnegative(),
      dealExpiryHours: z.number().int().positive(),
    }),
  }),
  parties: z.array(Occupancy.extend({ variant: z.string().min(1), active: z.boolean() })),
  airports: z.array(
    z.object({ airportCode: z.string().length(3), preference: z.number().int().positive() }),
  ),
  airportCosts: z.array(
    z.object({
      airportCode: z.string().length(3),
      label: z.string(),
      travelMode: z.string(),
      travelCostPence: z.number().int().nonnegative(),
      parkingCostPence: z.number().int().nonnegative(),
      driveHomeMinutes: z.number().int().nonnegative(),
      overnightHotelPence: z.number().int().nonnegative(),
      timezone: z.string(),
    }),
  ),
  roomSetups: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string(),
      rooms: z.number().int().positive(),
      roomType: z.enum(['standard', 'family']),
      occupancy: z.array(Occupancy),
    }),
  ),
  sellers: z.array(
    z.object({ id: z.enum(SELLER_IDS), displayName: z.string(), enabled: z.boolean() }),
  ),
});

export type Seed = z.infer<typeof SeedSchema>;

// BHX/BRS drive_home_minutes are owner-editable estimates. The overnight rule
// only needs "over 45 minutes": BHX yes, BRS no.
export const SEED: Seed = {
  search: {
    slug: 'rixos-radamis-may-2027',
    name: 'Rixos Radamis, May 2027',
    hotelName: 'Rixos Radamis Sharm El Sheikh',
    hotelLocation: 'Nabq Bay, Sharm El Sheikh, Egypt',
    boardBasis: 'all_inclusive',
    nights: 7,
    departFrom: '2027-05-03',
    departTo: '2027-05-31',
    maxPricePence: null,
    alertRules: {
      bestDropPence: 5000,
      brsWithinBhxPence: 15000,
      newDealMinPence: 5000,
      dealExpiryHours: 24,
    },
  },
  parties: [
    { variant: 'base', adults: 2, childAges: [4], infants: 1, active: true },
    { variant: 'three_adults', adults: 3, childAges: [4], infants: 1, active: false },
  ],
  airports: [
    { airportCode: 'BRS', preference: 1 },
    { airportCode: 'BHX', preference: 2 },
  ],
  airportCosts: [
    {
      airportCode: 'BHX',
      label: 'Birmingham',
      travelMode: 'car',
      travelCostPence: 3500,
      parkingCostPence: 10000,
      driveHomeMinutes: 90,
      overnightHotelPence: 9000,
      timezone: 'Europe/London',
    },
    {
      airportCode: 'BRS',
      label: 'Bristol',
      travelMode: 'bus',
      travelCostPence: 3000,
      parkingCostPence: 0,
      driveHomeMinutes: 30,
      overnightHotelPence: 9000,
      timezone: 'Europe/London',
    },
  ],
  roomSetups: [
    {
      key: 'cheapest_standard',
      label: 'Cheapest standard room',
      rooms: 1,
      roomType: 'standard',
      occupancy: [{ adults: 2, childAges: [4], infants: 1 }],
    },
    {
      key: 'two_standard',
      label: 'Two standard rooms',
      rooms: 2,
      roomType: 'standard',
      occupancy: [
        { adults: 1, childAges: [4], infants: 0 },
        { adults: 1, childAges: [], infants: 1 },
      ],
    },
    {
      key: 'family',
      label: 'Family room',
      rooms: 1,
      roomType: 'family',
      occupancy: [{ adults: 2, childAges: [4], infants: 1 }],
    },
  ],
  sellers: [
    { id: 'jet2', displayName: 'Jet2holidays', enabled: true },
    { id: 'tui', displayName: 'TUI', enabled: true },
    { id: 'on_the_beach', displayName: 'On the Beach', enabled: true },
    { id: 'easyjet_holidays', displayName: 'easyJet holidays', enabled: true },
  ],
};
