/**
 * RevenueCat Paywall host.
 *
 * Renders the paywall designed in the RevenueCat dashboard for the given
 * offering (RevenueCatUI.Paywall). Because the paywall comes from RC, it can
 * be edited, A/B tested (Experiments) and targeted without an app release,
 * and RC records paywall impressions/conversions for its Paywall charts —
 * none of which work with a hand-built paywall.
 *
 * Purchases are completed by RevenueCat. We intercept each one with
 * onPurchasePackageInitiated to show the UK/EU 14-day-withdrawal
 * acknowledgement first (UK + EU/EEA store accounts only — lib/withdrawal-region.ts) (WithdrawalAckModal) and only resume the purchase
 * once it's captured (lib/paywall-consent.ts).
 */

import { useCallback, useRef, useState } from "react";
import { Alert, type StyleProp, type ViewStyle } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";

import { WithdrawalAckModal } from "@/components/paywall/WithdrawalAckModal";
import {
  WITHDRAWAL_CONSENT_TEXT,
  WITHDRAWAL_WORDING_VERSION,
} from "@/lib/consent";
import { captureWithdrawalAck, planForPackageType } from "@/lib/paywall-consent";
import { requiresWithdrawalAck } from "@/lib/withdrawal-region";
import { RC_ENTITLEMENT_PRO } from "@acuity/shared";

type CustomVariables = NonNullable<
  React.ComponentProps<typeof RevenueCatUI.Paywall>["options"]
>["customVariables"];

export interface RcPaywallProps {
  offering: PurchasesOffering;
  /** Whether a Ripple account is signed in (decides how consent is recorded). */
  signedIn: boolean;
  customVariables?: CustomVariables;
  style?: StyleProp<ViewStyle>;
  onPurchased: (info: CustomerInfo, pkg: PurchasesPackage | null) => void;
  onRestored: (hasPro: boolean) => void;
  onDismiss: () => void;
}

export function RcPaywall(props: RcPaywallProps) {
  const [pending, setPending] = useState<{
    pkg: PurchasesPackage;
    resume: (shouldResume: boolean) => void;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const lastPkg = useRef<PurchasesPackage | null>(null);

  const onPurchasePackageInitiated = useCallback(
    ({
      packageBeingPurchased,
      resume,
    }: {
      packageBeingPurchased: PurchasesPackage;
      resume: (shouldResume: boolean) => void;
    }) => {
      // UK/EU/EEA store accounts get the 14-day acknowledgement first;
      // everyone else goes straight to the store sheet.
      void requiresWithdrawalAck().then((required) => {
        if (required) {
          setPending({ pkg: packageBeingPurchased, resume });
        } else {
          lastPkg.current = packageBeingPurchased;
          resume(true);
        }
      });
    },
    []
  );

  const cancelAck = useCallback(() => {
    pending?.resume(false);
    setPending(null);
  }, [pending]);

  const confirmAck = useCallback(async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await captureWithdrawalAck({
        signedIn: props.signedIn,
        consentText: WITHDRAWAL_CONSENT_TEXT,
        wordingVersion: WITHDRAWAL_WORDING_VERSION,
        plan: planForPackageType(pending.pkg.packageType),
      });
      lastPkg.current = pending.pkg;
      pending.resume(true);
      setPending(null);
    } catch {
      Alert.alert(
        "Couldn't save your acknowledgement",
        "Check your connection and try again. You haven't been charged."
      );
      pending.resume(false);
      setPending(null);
    } finally {
      setSaving(false);
    }
  }, [pending, props.signedIn]);

  return (
    <>
      <RevenueCatUI.Paywall
        style={props.style}
        options={{
          offering: props.offering,
          ...(props.customVariables ? { customVariables: props.customVariables } : {}),
        }}
        onPurchasePackageInitiated={onPurchasePackageInitiated}
        onPurchaseCompleted={({ customerInfo }) =>
          props.onPurchased(customerInfo, lastPkg.current)
        }
        onRestoreCompleted={({ customerInfo }) =>
          props.onRestored(!!customerInfo.entitlements.active[RC_ENTITLEMENT_PRO])
        }
        onDismiss={props.onDismiss}
      />
      <WithdrawalAckModal
        visible={pending !== null}
        saving={saving}
        onConfirm={confirmAck}
        onCancel={cancelAck}
      />
    </>
  );
}
