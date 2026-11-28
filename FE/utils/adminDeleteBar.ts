// Selection delete bar (admin Events / Accounts). On phone the old w-1/2 +
// px-8 shell was ~195px wide, so "1 Event(s) selected" overlapped the orange
// Delete button (owner screenshot 2026-11-27). Desktop keeps the centered half-width bar.

export function adminDeleteBarClass(): string {
  return (
    'fixed z-[8] bottom-6 md:bottom-10 ' +
    'left-3 right-3 md:left-1/2 md:right-auto ' +
    'w-auto md:w-1/2 md:-translate-x-1/2 ' +
    'px-3 py-3 md:px-8 md:py-6 gap-3 ' +
    'bg-slate-black flex flex-row justify-between items-center ' +
    'shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-2xl'
  );
}

export function adminDeleteBarCountClass(): string {
  return 'text-off-white text-xl md:text-3xl font-semibold shrink-0';
}

export function adminDeleteBarLabelClass(): string {
  return 'text-sm md:text-base text-off-white min-w-0';
}

export function adminDeleteBarButtonClass(): string {
  return (
    'py-2 px-4 md:px-7 shrink-0 rounded-lg border-slate-black text-black ' +
    'border-[1px] bg-beaming-orange flex flex-row gap-2 md:gap-3 items-center'
  );
}
