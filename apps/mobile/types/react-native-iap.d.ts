/**
 * Minimal type declaration for react-native-iap.
 *
 * Phase 3a (2026-05-03) added react-native-iap to apps/mobile/package.json
 * but Jim runs `npm install` separately (and EAS rebuilds the native
 * shell). Until that install lands, tsc would error
 * `Cannot find module "react-native-iap"` on the dynamic import in
 * `apps/mobile/lib/iap.ts`. This shim acknowledges the module exists
 * with `unknown` exports — sufficient for the wrapper, which already
 * narrows every value through `stringField()` / type-narrowing.
 *
 * Once `npm install` runs and the real types resolve, the bundled
 * declarations take precedence over this shim (TS uses the more
 * specific module declaration). Safe to leave in place permanently;
 * remove if it ever causes a conflict.
 */

declare module "react-native-iap" {
  // Loose enough that the wrapper compiles. The wrapper's runtime
  // code defends against shape drift (`Record<string, unknown>`
  // narrowing on every field).
  export const initConnection: () => Promise<unknown>;
  export const endConnection: () => Promise<unknown>;
  export const getSubscriptions: (args: {
    skus: string[];
  }) => Promise<unknown[]>;
  export const requestSubscription: (args: {
    sku: string;
  }) => Promise<unknown>;
  export const getAvailablePurchases: () => Promise<unknown[]>;
  export const finishTransaction: (args: {
    purchase: unknown;
    isConsumable: boolean;
  }) => Promise<unknown>;
  export const purchaseUpdatedListener: (
    cb: (purchase: Record<string, unknown>) => void
  ) => unknown;
  export const purchaseErrorListener: (
    cb: (err: Record<string, unknown>) => void
  ) => unknown;
}
