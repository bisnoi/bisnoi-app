// Offer helpers — keep client-side discount preview in sync with backend create_order logic.
// Backend rule (features.py + server.create_order):
//   percent: floor(subtotal * value / 100), capped by max_discount
//   flat:    min(value, subtotal)
//   applies only when subtotal >= min_order

export type Offer = {
  id: string;
  title: string;
  code?: string;
  type: "percent" | "flat";
  value: number;
  max_discount?: number | null;
  min_order?: number | null;
  description?: string | null;
  active?: boolean;
};

export function offerDiscount(offer: Offer | null | undefined, subtotal: number): number {
  if (!offer) return 0;
  const minOrder = offer.min_order || 0;
  if (subtotal < minOrder) return 0;
  if (offer.type === "percent") {
    let d = Math.floor((subtotal * offer.value) / 100);
    if (offer.max_discount) d = Math.min(d, Math.floor(offer.max_discount));
    return Math.max(0, d);
  }
  return Math.max(0, Math.min(Math.floor(offer.value), subtotal));
}

export function bestOffer(offers: Offer[] | null | undefined, subtotal: number): { offer: Offer; discount: number } | null {
  let best: { offer: Offer; discount: number } | null = null;
  for (const o of offers || []) {
    const d = offerDiscount(o, subtotal);
    if (d > 0 && (!best || d > best.discount)) best = { offer: o, discount: d };
  }
  return best;
}

// Short human label for an offer badge, e.g. "60% OFF up to ₹120" or "₹100 OFF".
export function offerLabel(offer: Offer): string {
  if (offer.type === "percent") {
    return `${offer.value}% OFF${offer.max_discount ? ` up to ₹${offer.max_discount}` : ""}`;
  }
  return `₹${offer.value} OFF`;
}
