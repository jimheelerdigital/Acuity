import { api } from "@/lib/api";

export type CustomerPricingTier = "legacy" | "v2";

export interface CustomerRcProfile {
  tier: CustomerPricingTier;
  mediaSource: string | null;
  campaign: string | null;
}

/**
 * Which price tier the server says this customer gets (legacy customers keep
 * $4.99 / $39.99 — see apps/web/src/lib/pricing-tier.ts) plus their signup
 * attribution. Falls back to "v2" / no attribution on any failure, matching
 * the server's own fallback. `attribution` is absent on servers older than
 * the RC-attributes change; that simply means no attribution is sent.
 */
export async function fetchCustomerRcProfile(): Promise<CustomerRcProfile> {
  try {
    const res = await api.get<{
      tier?: string;
      attribution?: { mediaSource?: string | null; campaign?: string | null };
    }>("/api/user/pricing-tier");
    return {
      tier: res?.tier === "legacy" ? "legacy" : "v2",
      mediaSource: res?.attribution?.mediaSource ?? null,
      campaign: res?.attribution?.campaign ?? null,
    };
  } catch {
    return { tier: "v2", mediaSource: null, campaign: null };
  }
}

export async function fetchCustomerPricingTier(): Promise<CustomerPricingTier> {
  return (await fetchCustomerRcProfile()).tier;
}
