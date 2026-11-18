import { Loader2 } from "lucide-react";

export default function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-xs text-slate-200 shadow-xl">
        <Loader2 size={16} className="animate-spin text-sky-300" />
        {message}
      </div>
    </div>
  );
}
