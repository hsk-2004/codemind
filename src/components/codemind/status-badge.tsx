import { cn } from '@/lib/utils'

type Props = {
  ok: boolean | undefined
  okLabel?: string
  failLabel?: string
  className?: string
}

export function StatusBadge({ ok, okLabel = 'Online', failLabel = 'Offline', className }: Props) {
  const pending = ok === undefined
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        pending && 'border-border text-muted-foreground',
        ok === true && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
        ok === false && 'border-red-500/30 bg-red-500/10 text-red-500',
        className,
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', {
          'animate-pulse bg-muted-foreground': pending,
          'bg-emerald-500': ok === true,
          'bg-red-500': ok === false,
        })}
      />
      {pending ? 'Checking…' : ok ? okLabel : failLabel}
    </span>
  )
}
