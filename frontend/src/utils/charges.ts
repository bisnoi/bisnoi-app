// Shared order-charge math — mirrors the backend (/api/settings/charges + order quote)
// so the bill shown to the customer matches exactly what the server computes.

export type Charges = {
  delivery_charge: number;
  free_delivery_above: number;
  packing_charge: number;
  gst_percent: number;
  delivery_mode?: "flat" | "per_km";
  per_km_charge?: number;
  base_delivery_fee?: number;
  min_delivery_fee?: number;
};

export const DEFAULT_CHARGES: Charges = {
  delivery_charge: 0,
  free_delivery_above: 0,
  packing_charge: 0,
  gst_percent: 0,
  delivery_mode: "flat",
  per_km_charge: 0,
  base_delivery_fee: 0,
  min_delivery_fee: 0,
};

export function normalizeCharges(raw: any): Charges {
  const c = raw || {};
  const num = (v: any, d: number) => (typeof v === "number" && v >= 0 ? v : d);
  return {
    delivery_charge: num(c.delivery_charge, 0),
    free_delivery_above: num(c.free_delivery_above, 0),
    packing_charge: num(c.packing_charge, 0),
    gst_percent: num(c.gst_percent, 0),
    delivery_mode: c.delivery_mode === "per_km" ? "per_km" : "flat",
    per_km_charge: num(c.per_km_charge, 0),
    base_delivery_fee: num(c.base_delivery_fee, 0),
    min_delivery_fee: num(c.min_delivery_fee, 0),
  };
}

// Distance-aware delivery fee (mirrors backend compute_delivery_fee).
export function computeDeliveryFee(subtotal: number, distanceKm: number, charges: Charges): number {
  const c = normalizeCharges(charges);
  if (subtotal <= 0) return 0;
  if (c.free_delivery_above > 0 && subtotal >= c.free_delivery_above) return 0;
  if (c.delivery_mode === "per_km") {
    let fee = (c.base_delivery_fee || 0) + (c.per_km_charge || 0) * Math.max(0, distanceKm || 0);
    fee = Math.max(fee, c.min_delivery_fee || 0);
    return Math.round(fee);
  }
  return Math.round(c.delivery_charge);
}

export type Bill = {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  packing_charge: number;
  gst_percent: number;
  gst_amount: number;
  total: number;
};

// Compute the full bill breakdown. `discount` is the already-resolved discount amount.
export function computeBill(subtotal: number, discount: number, charges: Charges): Bill {
  const c = normalizeCharges(charges);
  const disc = Math.min(Math.max(0, discount || 0), subtotal);

  let delivery_fee = 0;
  if (subtotal <= 0) {
    delivery_fee = 0;
  } else if (c.free_delivery_above > 0 && subtotal >= c.free_delivery_above) {
    delivery_fee = 0;
  } else {
    delivery_fee = Math.round(c.delivery_charge);
  }

  const packing_charge = subtotal > 0 ? Math.round(c.packing_charge) : 0;
  const taxable = Math.max(0, subtotal - disc);
  const gst_amount = Math.round((taxable * c.gst_percent) / 100);
  const total = Math.max(0, subtotal - disc + delivery_fee + packing_charge + gst_amount);

  return {
    subtotal,
    discount: disc,
    delivery_fee,
    packing_charge,
    gst_percent: c.gst_percent,
    gst_amount,
    total,
  };
}
