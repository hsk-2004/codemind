import { cn } from '@/lib/utils'

/** Visualises a cosine-similarity score (0..1). */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)))
  return (
    <div className={cn('flex items-center gap-2', className)} title={`Cosine similarity ${score.toFixed(3)}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-muted-foreground')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}
