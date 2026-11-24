"use client";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[70] rounded-xl bg-ink/95 px-4 py-3 text-center text-sm font-medium text-paper shadow-lg"
    >
      {message}
    </div>
  );
}
