import { forwardRef } from "react";
import { View, type ViewProps } from "react-native";

/**
 * Tiny wrapper used as the direct child of `<CopilotStep>` when the
 * actual target is a function component (Avatar, IdentityHero, etc.)
 * or a complex composition.
 *
 * react-native-copilot uses `cloneElement(child, { ref })` to attach
 * a ref it can measure. Function components without forwardRef
 * swallow that ref silently and the cutout falls back to (0,0). The
 * View under TourTarget forwards the ref properly, and
 * `collapsable={false}` keeps Android's view-collapsing optimization
 * from removing the native view we need for measurement.
 */
export const TourTarget = forwardRef<View, ViewProps>(function TourTarget(
  props,
  ref
) {
  return <View collapsable={false} ref={ref} {...props} />;
});
