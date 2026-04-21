"use client";

export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/40 text-sm">
      {message}
    </div>
  );
}
