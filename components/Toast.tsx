"use client";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-[70] rounded-xl bg-slate-900/95 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
