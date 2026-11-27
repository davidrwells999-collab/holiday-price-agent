/**
 * Single source of truth for eval pass thresholds.
 * The deals threshold is added in Phase 4, once labelled deal fixtures exist.
 */
export const THRESHOLDS = {
  extraction: { hardFields: 1, overall: 0.95 },
  trueCost: { exact: 1 },
  alerts: { mustAlertMisses: 0, maxFalseAlertsPer20: 1 },
  safety: { pass: 1 },
} as const;
