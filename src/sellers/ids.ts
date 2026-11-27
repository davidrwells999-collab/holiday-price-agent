export const SELLER_IDS = ['jet2', 'tui', 'on_the_beach', 'easyjet_holidays'] as const;

export type SellerId = (typeof SELLER_IDS)[number];

export function isSellerId(value: string): value is SellerId {
  return (SELLER_IDS as readonly string[]).includes(value);
}

export function sellerFlagKey(id: SellerId): `seller_${SellerId}_enabled` {
  return `seller_${id}_enabled`;
}
