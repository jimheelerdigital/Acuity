import { api } from "@/lib/api";

export type CustomerPricingTier = "legacy" | "v2";

/**
 * Which price tier the server says this customer gets (legacy customers keep
 * $4.99 / $39.99 — see apps/web/src/lib/pricing-tier.ts). Falls back to "v2"
 * on any failure, matching the server's own fallback.
 */
export async function fetchCustomerPricingTier(): Promise<CustomerPricingTier> {
  try {
    const res = await api.get<{ tier?: string }>("/api/user/pricing-tier");
    return res?.tier === "legacy" ? "legacy" : "v2";
  } catch {
    return "v2";
  }
}
