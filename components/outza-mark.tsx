export function OutzaMark({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0 rounded-[22%] shadow-sm ring-1 ring-white/10`} role="img" aria-label="Outza logo">
      <rect width="64" height="64" rx="14" fill="#0b0b0b" />
      <circle cx="32" cy="26" r="11" fill="none" stroke="#ffffff" strokeWidth="6" />
      <rect x="19" y="44" width="26" height="6" rx="2" fill="#e8553f" />
    </svg>
  )
}
