// Razorpay Checkout helper for the web (RN-Web / Expo web PWA).
// Loads checkout.js on demand and opens the hosted checkout with UPI prioritised
// (UPI intent opens installed UPI apps on mobile). Server verifies the signature.
import { Platform } from "react-native";

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function isWeb(): boolean {
  return Platform.OS === "web" && typeof document !== "undefined";
}

export async function loadRazorpay(): Promise<boolean> {
  if (!isWeb()) return false;
  if ((window as any).Razorpay) return true;
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).Razorpay) return resolve(true);
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export type RzpResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RzpOpenOpts = {
  keyId: string;
  orderId: string;
  amount: number; // paise
  currency?: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  themeColor?: string;
  onSuccess: (r: RzpResponse) => void;
  onDismiss?: () => void;
  onError?: (e: any) => void;
};

export async function openRazorpayCheckout(opts: RzpOpenOpts): Promise<void> {
  const ok = await loadRazorpay();
  if (!ok || !(window as any).Razorpay) {
    opts.onError?.(new Error("Could not load the payment gateway. Check your connection and try again."));
    return;
  }
  const options: any = {
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: opts.currency || "INR",
    name: opts.name || "Bisnoi",
    description: opts.description || "",
    prefill: {
      name: opts.prefill?.name || "",
      contact: opts.prefill?.contact || "",
      email: opts.prefill?.email || "",
    },
    theme: { color: opts.themeColor || "#16A34A" },
    // Prioritise UPI (UPI intent opens GPay/PhonePe/Paytm on mobile) while still
    // allowing cards / netbanking / wallets as fallbacks.
    config: {
      display: {
        blocks: {
          upi: { name: "Pay using UPI", instruments: [{ method: "upi" }] },
        },
        sequence: ["block.upi"],
        preferences: { show_default_blocks: true },
      },
    },
    handler: (resp: RzpResponse) => opts.onSuccess(resp),
    modal: { ondismiss: () => opts.onDismiss?.() },
  };
  try {
    const rzp = new (window as any).Razorpay(options);
    rzp.on("payment.failed", (e: any) => opts.onError?.(e?.error || e));
    rzp.open();
  } catch (e) {
    opts.onError?.(e);
  }
}
