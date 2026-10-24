export function Spinner({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-[3px] border-surface-600 border-t-brand-500 ${className}`}
      role="status"
      aria-label="Cargando"
    />
  )
}

export default function LoadingScreen() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 bg-surface-950">
      <Spinner className="h-10 w-10" />
      <p className="text-sm text-zinc-500">Cargando Mesora…</p>
    </div>
  )
}