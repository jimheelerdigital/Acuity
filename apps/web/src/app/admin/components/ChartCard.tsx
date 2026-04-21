"use client";

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartCard({ title, children, className }: Props) {
  return (
    <div className={`rounded-xl bg-[#13131F] p-5 ${className ?? ""}`}>
      <h3 className="mb-4 text-sm font-medium text-white/60">{title}</h3>
      {children}
    </div>
  );
}
