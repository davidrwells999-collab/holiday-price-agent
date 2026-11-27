import { z } from 'zod';
import { SELLER_IDS, sellerFlagKey } from '../sellers/ids.js';

export const DISTINCT_ID = 'holiday-agent';

const sellerId = z.enum(SELLER_IDS);
const airportCode = z.string().regex(/^[A-Z]{3}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pence = z.number().int();
const runId = z.uuid();

// No free-text string properties anywhere: only enums, ids, numbers and strict patterns.
export const EVENT_SCHEMAS = {
  search_run_started: z.strictObject({
    run_id: runId,
    trigger: z.enum(['schedule', 'manual', 'canary']),
    sellers: z.array(sellerId),
  }),
  search_run_finished: z.strictObject({
    run_id: runId,
    duration_ms: z.number().int().min(0),
    sellers_ok: z.number().int(),
    sellers_failed: z.number().int(),
    quotes: z.number().int(),
  }),
  quote_saved: z.strictObject({
    run_id: runId,
    seller: sellerId,
    airport: airportCode,
    depart_date: isoDate,
    room_setup: z.string().regex(/^[a-z_]{1,40}$/),
    true_cost_pence: pence,
  }),
  scrape_failed: z.strictObject({
    run_id: runId,
    seller: sellerId,
    reason: z.enum(['captcha', 'bot_check', 'timeout', 'parse_failed', 'unavailable', 'error']),
  }),
  captcha_detected: z.strictObject({
    run_id: runId,
    seller: sellerId,
  }),
  deal_found: z.strictObject({
    seller: sellerId,
    source: z.enum([
      'topcashback',
      'quidco',
      'blue_light_card',
      'student_beans',
      'mse',
      'hotukdeals',
    ]),
    type: z.enum(['code', 'cashback', 'sale']),
    value_pence: pence.nullable(),
    value_bps: z.number().int().nullable(),
  }),
  alert_sent: z.strictObject({
    reason: z.enum([
      'best_drop',
      'brs_within_bhx',
      'new_deal',
      'deal_expiring',
      'seller_unhealthy',
      'digest',
    ]),
    seller: sellerId.nullable(),
  }),
  eval_run: z.strictObject({
    suite: z.string().regex(/^[a-z_-]{1,40}$/),
    score: z.number().min(0).max(1),
    threshold: z.number().min(0).max(1),
    passed: z.boolean(),
    git_sha: z.string().regex(/^([0-9a-f]{7,40}|unknown)$/),
    model: z.string().max(60).nullable(),
  }),
} as const;

// Exceptions never carry message text: only the class name, a short hash and the length.
export const EXCEPTION_SCHEMA = z.strictObject({
  error_name: z.string().regex(/^[A-Za-z][A-Za-z0-9_$]{0,59}$/),
  message_sha256: z.string().regex(/^[0-9a-f]{16}$/),
  message_length: z.number().int().min(0),
});
export type ExceptionProps = z.infer<typeof EXCEPTION_SCHEMA>;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventProps<E extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[E]>;

// The model-switch flag is added in Phase 7.
export const FLAG_KEYS = SELLER_IDS.map((id) => sellerFlagKey(id));
export type FlagKey = ReturnType<typeof sellerFlagKey>;
