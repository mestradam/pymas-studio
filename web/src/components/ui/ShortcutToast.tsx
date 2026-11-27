/** Aviso breve abajo al centro del visor tras usar un atajo de teclado. */
export default function ShortcutToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      key={message}
      className="pointer-events-none absolute bottom-14 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/90 px-3 py-1 text-[11px] font-medium text-slate-100 shadow-lg backdrop-blur"
      role="status"
    >
      {message}
    </div>
  );
}
