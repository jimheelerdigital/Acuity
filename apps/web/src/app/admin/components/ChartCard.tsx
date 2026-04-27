"use client";

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartCard({ title, children, className }: Props) {
  return (
    <div
      className={`rounded-xl bg-[#13131F] ${className ?? ""}`}
      style={{ padding: 22 }}
    >
      <h3
        className="mb-5 text-white/75"
        style={{ fontSize: 16, fontWeight: 500 }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
