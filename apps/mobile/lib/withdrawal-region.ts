import { useEffect, useState } from "react";

import { getStorefrontCountryCode } from "@/lib/revenuecat";

/**
 * Who sees the 14-day-withdrawal acknowledgement.
 *
 * The acknowledgement exists for the UK Consumer Contracts Regulations 2013
 * (Reg. 36–37) and EU Directive 2011/83 Art. 16(m) — consumers in the UK
 * and the EU/EEA. Showing it to everyone (the pre-1.9 behaviour) confused
 * US customers, who have no such right and who had often already finished
 * their trial ("why mention 14 days?"). Decision (Jim, 2026-10-01): show it
 * only to UK + EU/EEA store accounts.
 *
 * Fail-safe: if the store country can't be determined, we SHOW it. Being
 * shown an extra acknowledgement is harmless; skipping a required one is not.
 */
const EU_EEA_UK_ALPHA2 = new Set([
  // EU-27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
  // UK
  "GB",
]);
const EU_EEA_UK_ALPHA3 = new Set([
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
  "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
  "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
  "ISL", "LIE", "NOR",
  "GBR",
]);

export function countryRequiresWithdrawalAck(code: string | null): boolean {
  if (!code) return true; // unknown → fail safe
  const c = code.toUpperCase();
  return EU_EEA_UK_ALPHA2.has(c) || EU_EEA_UK_ALPHA3.has(c);
}

let cached: boolean | null = null;

export async function requiresWithdrawalAck(): Promise<boolean> {
  if (cached !== null) return cached;
  const code = await getStorefrontCountryCode();
  const required = countryRequiresWithdrawalAck(code);
  // Only cache a definite answer; an unknown country is retried next time.
  if (code) cached = required;
  return required;
}

/**
 * Hook form. `true` until the store country is known (fail-safe), then the
 * real answer.
 */
export function useWithdrawalAckRequired(): boolean {
  const [required, setRequired] = useState<boolean>(cached ?? true);
  useEffect(() => {
    let alive = true;
    void requiresWithdrawalAck().then((r) => {
      if (alive) setRequired(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return required;
}
