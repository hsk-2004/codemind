'use client'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Minus, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { InfoTip } from '@/components/codemind/info-tip'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { RouterOutputs } from '@/trpc/react'

export type EvalReport = RouterOutputs['evaluation']['run']

const METRICS = [
  { key: 'hitRate', label: 'Hit rate', help: 'How often a correct file appeared in the top results. 100% means every question found its file.', percent: true },
  { key: 'mrr', label: 'MRR', help: 'Mean Reciprocal Rank. It rewards a correct file near the top: rank 1 scores 1.0, rank 2 scores 0.5, rank 4 scores 0.25, a miss scores 0.', percent: false },
  { key: 'precision', label: 'Precision', help: 'Of the files returned, how many were correct. It is low by design when each question has one correct file and several are returned.', percent: true },
] as const

const config = {
  vector: { label: 'Vector only', color: '#38bdf8' },
  hybrid: { label: 'Hybrid', color: '#34d399' },
} satisfies ChartConfig

const pct = (value: number) => `${Math.round(value * 100)}%`

function Delta({ before, after, percent }: { before: number; after: number; percent: boolean }) {
  const diff = after - before
  if (Math.abs(diff) < 0.005) return <Badge variant="secondary" className="gap-1"><Minus className="size-3" /> same</Badge>
  const better = diff > 0
  const text = percent ? `${Math.abs(Math.round(diff * 100))} pts` : Math.abs(diff).toFixed(2)
  return (
    <Badge variant="outline" className={cn('gap-1', better ? 'border-emerald-500/40 text-emerald-500' : 'border-red-500/40 text-red-400')}>
      {better ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />} {text}
    </Badge>
  )
}

function Outcome({ rank, k }: { rank: number; k: number }) {
  return rank > 0 ? (
    <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="size-4" /> found at #{rank}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-400" title={`Not in the top ${k}`}><X className="size-4" /> missed</span>
  )
}

export function EvalResults({ report }: { report: EvalReport }) {
  const [vector, hybrid] = report.strategies as [EvalReport['strategies'][number], EvalReport['strategies'][number]]
  const chart = METRICS.map((m) => ({
    metric: m.label,
    vector: Math.round(vector.metrics[m.key] * 100),
    hybrid: Math.round(hybrid.metrics[m.key] * 100),
  }))

  return (
    <section className="space-y-fluid-md" aria-label="Evaluation results">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-fluid-lg font-semibold">Results</h2>
        <p className="text-fluid-xs text-muted-foreground">
          {vector.metrics.questions} questions · top {report.k} files · {report.level}-level index · {new Date(report.ranAt).toLocaleString()}
        </p>
      </div>

      {report.level === 'file' && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-fluid-sm text-fluid-xs text-amber-500">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          This repository only has the file-level index, so hybrid search has no extra chunks to search and behaves like vector search. Reconnect the repository to build the function-level index.
        </p>
      )}

      <div className="grid gap-fluid-md sm:grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        {METRICS.map((m) => (
          <Card key={m.key} className="gap-fluid-xs py-fluid-md">
            <CardHeader className="px-fluid-md">
              <CardTitle className="flex items-center gap-1.5 text-fluid-sm">{m.label} <InfoTip>{m.help}</InfoTip></CardTitle>
            </CardHeader>
            <CardContent className="space-y-fluid-xs px-fluid-md">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-fluid-xs text-muted-foreground">Vector</p>
                  <p className="text-fluid-xl font-semibold tabular-nums">{m.percent ? pct(vector.metrics[m.key]) : vector.metrics[m.key].toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-fluid-xs text-muted-foreground">Hybrid</p>
                  <p className="text-fluid-xl font-semibold tabular-nums">{m.percent ? pct(hybrid.metrics[m.key]) : hybrid.metrics[m.key].toFixed(2)}</p>
                </div>
              </div>
              <Delta before={vector.metrics[m.key]} after={hybrid.metrics[m.key]} percent={m.percent} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-fluid-sm py-fluid-md">
        <CardHeader className="px-fluid-md">
          <CardTitle className="text-fluid-base">Vector vs hybrid</CardTitle>
          <CardDescription className="text-fluid-xs">All three scores as percentages (MRR × 100). Taller is better. Average retrieval time: vector {Math.round(vector.avgMs)} ms, hybrid {Math.round(hybrid.avgMs)} ms per question.</CardDescription>
        </CardHeader>
        <CardContent className="px-fluid-sm">
          <ChartContainer config={config} className="aspect-chart w-full max-h-[26rem]">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="metric" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={40} unit="%" domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="vector" name="Vector only" fill="var(--color-vector)" radius={4} />
              <Bar dataKey="hybrid" name="Hybrid" fill="var(--color-hybrid)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Question</TableHead>
              <TableHead className="min-w-40">Correct file</TableHead>
              <TableHead className="min-w-32">Vector</TableHead>
              <TableHead className="min-w-32">Hybrid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vector.questions.map((q, i) => {
              const h = hybrid.questions[i]!
              return (
                <TableRow key={q.question + i} className={cn((q.hitRank > 0) !== (h.hitRank > 0) && 'bg-muted/40')}>
                  <TableCell className="whitespace-normal text-fluid-sm">{q.question}</TableCell>
                  <TableCell className="whitespace-normal break-all font-mono text-fluid-xs">{q.expectedFiles.join(', ')}</TableCell>
                  <TableCell className="text-fluid-xs"><Outcome rank={q.hitRank} k={report.k} /></TableCell>
                  <TableCell className="text-fluid-xs"><Outcome rank={h.hitRank} k={report.k} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-fluid-xs text-muted-foreground">Shaded rows are questions where hybrid and vector search disagreed.</p>
    </section>
  )
}
