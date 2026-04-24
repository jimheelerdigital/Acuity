import type { ReactNode } from "react";

type Variant = "fluid" | "narrow";

type PageContainerProps = {
  children: ReactNode;
  /**
   * Mobile-width cap. Preserves the current per-page width so mobile is
   * unchanged by the desktop redesign. Accepts the raw tailwind token
   * after `max-w-`. Default: "5xl".
   */
  mobileWidth?: "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
  /**
   * - `fluid` (default): full-width at `lg+` within the AppShell's 1600px
   *   cap. Good for dashboards + visualizations.
   * - `narrow`: keeps `max-w-3xl` even on desktop. Use for long-form
   *   reading screens where wider text hurts legibility (Ask your past
   *   self, State of Me detail).
   */
  variant?: Variant;
  className?: string;
};

const MOBILE_WIDTHS: Record<NonNullable<PageContainerProps["mobileWidth"]>, string> = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

export function PageContainer({
  children,
  mobileWidth = "5xl",
  variant = "fluid",
  className = "",
}: PageContainerProps) {
  const mobile = MOBILE_WIDTHS[mobileWidth];
  // fluid: remove cap at lg. narrow: keep a reading-width cap even on lg.
  const desktop =
    variant === "narrow" ? "lg:max-w-3xl" : "lg:max-w-none";
  return (
    <div className={`mx-auto w-full ${mobile} ${desktop} px-6 py-10 lg:px-0 lg:py-0 ${className}`}>
      {children}
    </div>
  );
}
