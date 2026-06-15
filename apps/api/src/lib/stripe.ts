import type { Env } from "../types";

/**
 * Minimal Stripe integration over fetch — no SDK, Workers-friendly.
 * Covers exactly what the storefront needs: create a Checkout Session and
 * verify incoming webhook signatures.
 */

const enc = new TextEncoder();

export function stripeConfigured(env: Env): boolean {
  return typeof env.STRIPE_SECRET_KEY === "string" && env.STRIPE_SECRET_KEY.length > 0;
}

export interface CheckoutParams {
  priceCents: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(
  env: Env,
  params: CheckoutParams,
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", params.successUrl);
  form.set("cancel_url", params.cancelUrl);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", params.currency);
  form.set("line_items[0][price_data][unit_amount]", String(params.priceCents));
  form.set("line_items[0][price_data][product_data][name]", params.productName);
  if (params.customerEmail) form.set("customer_email", params.customerEmail);
  for (const [k, v] of Object.entries(params.metadata ?? {})) form.set(`metadata[${k}]`, v);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.url || !data.id) {
    throw new Error(data.error?.message ?? `Stripe checkout failed (${res.status})`);
  }
  return { id: data.id, url: data.url };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe webhook signature and return the parsed event. Throws on failure. */
export async function verifyWebhook(env: Env, rawBody: string, sigHeader: string): Promise<any> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("Webhook secret not configured");
  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k] = v;
  }
  const timestamp = parts["t"];
  const expected = parts["v1"];
  if (!timestamp || !expected) throw new Error("Malformed Stripe-Signature header");

  // Reject events older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("Webhook timestamp out of tolerance");

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!timingSafeEqualHex(hex, expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(rawBody);
}
