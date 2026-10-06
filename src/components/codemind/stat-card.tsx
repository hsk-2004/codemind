import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: number | string | undefined
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'warning' | 'success'
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'default' }: Props) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {value === undefined ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          )}
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn('rounded-md p-2', {
            'bg-muted text-foreground': tone === 'default',
            'bg-amber-500/15 text-amber-500': tone === 'warning',
            'bg-emerald-500/15 text-emerald-500': tone === 'success',
          })}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}
