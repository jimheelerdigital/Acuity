import { useEffect } from "react";
import { router, type Href } from "expo-router";

import { LightScreen } from "./ui";

/**
 * Old v10 routes that v11 replaced (pain = branch picker, promise = mirror).
 * Kept as routes because Keenan's ads and older builds deep-link to them;
 * they forward to the v11 screen that took their place.
 */
export function V11Redirect({ to }: { to: Href }) {
  useEffect(() => {
    router.replace(to);
  }, [to]);
  return <LightScreen>{null}</LightScreen>;
}
