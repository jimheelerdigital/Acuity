"use client";

import { useEffect, type MutableRefObject } from "react";
import ForceGraph2D from "react-force-graph-2d";

/**
 * Thin client-only wrapper so the page can load react-force-graph-2d
 * through next/dynamic (it touches window on import) and still get the
 * graph instance: next/dynamic doesn't forward refs, so we hand the ref
 * object down as a plain prop.
 */
export default function ForceGraphCanvas({
  graphRef,
  onReady,
  ...props
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphRef: MutableRefObject<any>;
  onReady: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;
}) {
  useEffect(() => {
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ForceGraph2D ref={graphRef as any} {...(props as any)} />;
}
