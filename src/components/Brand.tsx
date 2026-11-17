export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <img src="/assets/lilacsave-logo.png" alt="" className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} object-contain drop-shadow-md`} />
    <div><div className={`${compact ? 'text-base' : 'text-lg'} font-bold leading-none tracking-tight text-slate-900`}>Lilac<span className="text-lilac-600">Save</span></div>{!compact && <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Your ideas, in your Drive</div>}</div>
  </div>
}
