"use client";

import React, { Component, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Error boundary that catches Recharts crashes (e.g. width/height -1,
 * infinite re-render loops) and shows a fallback instead of killing
 * the entire page.
 */
class ChartErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[SafeChart] Chart crashed:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center rounded-lg bg-white/5 text-xs text-white/30 p-4" style={{ minHeight: 120 }}>
            Chart failed to load
          </div>
        )
      );
    }
    return this.props.children;
  }
}

/**
 * Safe wrapper for any Recharts chart. Prevents the "width(-1) and
 * height(-1)" crash by:
 * 1. Waiting for the container to have positive dimensions before rendering
 * 2. Wrapping in an error boundary so crashes don't propagate
 * 3. Setting explicit min dimensions on the container
 */
export function SafeChart({
  children,
  height = 200,
  fallback,
}: {
  children: ReactNode;
  height?: number;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    // Check if container has positive dimensions
    const check = () => {
      if (ref.current && ref.current.offsetWidth > 0) {
        setReady(true);
      }
    };
    check();
    // If not ready immediately (hidden tab, etc.), poll briefly
    if (!ready) {
      const interval = setInterval(check, 100);
      const timeout = setTimeout(() => { clearInterval(interval); setReady(true); }, 2000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [ready]);

  return (
    <div ref={ref} style={{ minWidth: 100, minHeight: height, width: "100%" }}>
      <ChartErrorBoundary fallback={fallback}>
        {ready ? children : (
          <div className="flex items-center justify-center text-xs text-white/20" style={{ height }}>
            Loading chart...
          </div>
        )}
      </ChartErrorBoundary>
    </div>
  );
}
