'use client'
import { AlertTriangle, CheckCircle2, Circle, Database, FileCode2, GitCommitHorizontal, Github, ListFilter, Loader2, XCircle, Puzzle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import type { IndexEvent } from '@/lib/indexing-progress'
import { cn } from '@/lib/utils'

export interface IndexingJobView {
  status: string
  stage: string
  currentItem: string | null
  error: string | null
  createdAt: Date | string
  finishedAt: Date | string | null
  filesInRepo: number
  filesSelected: number
  filesProcessed: number
  filesEmbedded: number
  filesFailed: number
  commitsFound: number
  commitsAnalyzed: number
  breakingFound: number
  stageTimings: unknown
  events: unknown
}

const STAGES = [
  { key: 'loading', label: 'Load repository', icon: Github },
  { key: 'selecting', label: 'Select files', icon: ListFilter },
  { key: 'indexing', label: 'Summarise & embed', icon: FileCode2 },
  { key: 'chunking', label: 'Function-level chunks', icon: Puzzle },
  { key: 'commits', label: 'Analyse commits', icon: GitCommitHorizontal },
] as const

const ORDER = ['queued', 'loading', 'selecting', 'indexing', 'chunking', 'commits', 'done']

const fmt = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const levelStyle: Record<string, string> = {
  info: 'text-muted-foreground',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

export function IndexingProgress({ job, compact = false }: { job: IndexingJobView; compact?: boolean }) {
  const running = job.status === 'running'
  const now = useNow(running)
  const started = new Date(job.createdAt).getTime()
  const ended = job.finishedAt ? new Date(job.finishedAt).getTime() : now
  const timings = (job.stageTimings ?? {}) as Record<string, number>
  const events = (Array.isArray(job.events) ? job.events : []) as IndexEvent[]
  const currentIndex = ORDER.indexOf(job.stage)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  const filePct = job.filesSelected ? Math.round((job.filesProcessed / job.filesSelected) * 100) : 0
  const commitPct = job.commitsFound ? Math.round((job.commitsAnalyzed / job.commitsFound) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {running && <Loader2 className="size-4 animate-spin text-primary" />}
          {job.status === 'completed' && <CheckCircle2 className="size-4 text-emerald-500" />}
          {job.status === 'failed' && <XCircle className="size-4 text-red-500" />}
          <span className="font-medium">
            {running ? 'Indexing in progress' : job.status === 'completed' ? 'Indexing completed' : 'Indexing failed'}
          </span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {running ? 'Elapsed' : 'Took'} {fmt(Math.max(0, ended - started))}
        </span>
      </div>

      {job.error && <p className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-400">{job.error}</p>}

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const index = ORDER.indexOf(stage.key)
          const done = currentIndex > index || job.status === 'completed'
          const active = running && currentIndex === index
          const failedHere = job.status === 'failed' && currentIndex === index
          const time = timings[stage.key] ?? (active ? now - started - Object.values(timings).reduce((a, b) => a + b, 0) : undefined)
          return (
            <li
              key={stage.key}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3',
                active && 'border-primary/50 bg-primary/5',
                done && 'border-emerald-500/30',
                failedHere && 'border-red-500/40 bg-red-500/5',
              )}
            >
              <stage.icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{stage.label}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{time !== undefined && time > 0 ? fmt(time) : active ? '…' : '—'}</p>
              </div>
              {done ? <CheckCircle2 className="size-4 text-emerald-500" />
                : active ? <Loader2 className="size-4 animate-spin text-primary" />
                : failedHere ? <XCircle className="size-4 text-red-500" />
                : <Circle className="size-4 text-muted-foreground/40" />}
            </li>
          )
        })}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium"><FileCode2 className="size-4" /> Files</span>
            <span className="tabular-nums text-muted-foreground">{job.filesProcessed}/{job.filesSelected || '?'}</span>
          </div>
          <Progress value={filePct} />
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs sm:grid-cols-4">
            <Metric label="In repo" value={job.filesInRepo} />
            <Metric label="Selected" value={job.filesSelected} />
            <Metric label="Embedded" value={job.filesEmbedded} tone="good" />
            <Metric label="Failed" value={job.filesFailed} tone={job.filesFailed ? 'bad' : undefined} />
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium"><GitCommitHorizontal className="size-4" /> Commits</span>
            <span className="tabular-nums text-muted-foreground">{job.commitsAnalyzed}/{job.commitsFound || '?'}</span>
          </div>
          <Progress value={commitPct} />
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <Metric label="To analyse" value={job.commitsFound} />
            <Metric label="Analysed" value={job.commitsAnalyzed} tone="good" />
            <Metric label="Breaking" value={job.breakingFound} tone={job.breakingFound ? 'warn' : undefined} />
          </div>
        </div>
      </div>

      {running && job.currentItem && (
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Database className="size-4 shrink-0" /> Working on <span className="truncate font-mono text-foreground">{job.currentItem}</span>
        </p>
      )}

      {!compact && (
        <div>
          <p className="mb-2 text-sm font-medium">Activity log</p>
          <ol ref={logRef} className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-3 font-mono text-xs">
            {events.length === 0 && <li className="text-muted-foreground">Waiting for the first update…</li>}
            {events.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground/70">{new Date(e.at).toLocaleTimeString()}</span>
                {e.level === 'warn' && <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />}
                <span className={cn('break-all', levelStyle[e.level])}>{e.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums', tone === 'good' && 'text-emerald-500', tone === 'bad' && 'text-red-500', tone === 'warn' && 'text-amber-500')}>
        {value}
      </p>
    </div>
  )
}
