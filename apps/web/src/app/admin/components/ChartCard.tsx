"use client";

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Optional right-aligned header content (filters, toggles) */
  action?: React.ReactNode;
}

export default function ChartCard({ title, children, className, action }: Props) {
  return (
    <div
      className={`rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft ${className ?? ""}`}
      style={{ padding: 20 }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
