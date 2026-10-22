/**
 * Lets a scrollable screen bring a tour target into view before the
 * spotlight measures it (Jimmy, 10/22: the Setup stop sat at the bottom of
 * the screen, half under its card). The screen registers a function per
 * step index while it's mounted; TourProvider runs it in that step's
 * before(), after navigating and before spotlight measures.
 *
 * Pure (no React Native imports).
 */
type ScrollFn = () => Promise<void> | void;

const registry = new Map<number, ScrollFn>();

/** Register; returns the unregister function (use as an effect cleanup). */
export function registerTourScroll(stepIndex: number, fn: ScrollFn): () => void {
  registry.set(stepIndex, fn);
  return () => {
    if (registry.get(stepIndex) === fn) registry.delete(stepIndex);
  };
}

/** Runs the step's scroll function if its screen registered one. */
export async function runTourScroll(stepIndex: number): Promise<void> {
  const fn = registry.get(stepIndex);
  if (!fn) return;
  try {
    await fn();
  } catch {
    // A failed scroll just leaves the target where it was.
  }
}
