'use client'
import { Activity, AlertTriangle, BarChart3, Clock, Cpu, ExternalLink, Gauge, Hash, Snowflake, Zap } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/codemind/empty-state'
import { PageHeader } from '@/components/codemind/page-header'
import { StatCard } from '@/components/codemind/stat-card'
import useProject from '@/hooks/use-project'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'

const RANGES = [
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 24 * 7 },
  { label: 'Last 30 days', hours: 24 * 30 },
  { label: 'Last 90 days', hours: 24 * 90 },
]

const OPERATION_LABELS: Record<string, string> = {
  rag_answer: 'RAG answer',
  direct_answer: 'Answer without RAG',
  file_summary: 'File summary',
  commit_summary: 'Commit summary',
  breaking_change: 'Breaking-change check',
  embedding: 'Embedding',
}

const fmtMs = (ms: number | null | undefined) =>
  ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
const fmtNum = (n: number) => new Intl.NumberFormat('en', { notation: n >= 10_000 ? 'compact' : 'standard' }).format(n)

const chartTooltip = {
  contentStyle: { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--foreground)' },
}

export default function MetricsPage() {
  const { projects, projectId } = useProject()
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [rangeHours, setRangeHours] = useState(24 * 7)
  const effectiveProjectId = scope === 'current' && projectId.trim() ? projectId : undefined
  const { data, isLoading, isFetching } = api.metrics.overview.useQuery(
    { projectId: effectiveProjectId, rangeHours },
    { refetchInterval: 15_000 },
  )
  const currentName = projects?.find((p) => p.id === projectId)?.name

  const bucketLabel = (iso: string) =>
    data?.bucket === 'hour'
      ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI metrics"
        description="Every model call is measured, local or cloud: tokens, generation speed, model load time and latency. Updates every 15 seconds."
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Select value={scope} onValueChange={(v) => setScope(v as 'current' | 'all')}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current" disabled={!currentName}>{currentName ? `This repo: ${currentName}` : 'This repo'}</SelectItem>
                <SelectItem value="all">All my repositories</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.hours} value={String(r.hours)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Model calls" value={data?.totals.calls} icon={Activity} hint={isFetching ? 'Refreshing…' : undefined} />
        <StatCard
          label="Tokens"
          value={data ? fmtNum(data.totals.promptTokens + data.totals.completionTokens) : undefined}
          icon={Hash}
          hint={data ? `${fmtNum(data.totals.promptTokens)} in · ${fmtNum(data.totals.completionTokens)} out` : undefined}
        />
        <StatCard label="Avg speed" value={data ? (data.totals.avgTokensPerSecond ? `${data.totals.avgTokensPerSecond} tok/s` : '—') : undefined} icon={Zap} hint="Generation only" />
        <StatCard label="Avg latency" value={data ? fmtMs(data.totals.avgLatencyMs) : undefined} icon={Clock} />
        <StatCard label="p95 latency" value={data ? fmtMs(data.totals.p95LatencyMs) : undefined} icon={Gauge} hint="95% of calls were faster" />
        <StatCard
          label="Errors"
          value={data?.totals.errors}
          icon={AlertTriangle}
          tone={data && data.totals.errors > 0 ? 'warning' : 'success'}
          hint={data && data.totals.calls > 0 ? `${((data.totals.errors / data.totals.calls) * 100).toFixed(1)}% · ${data.totals.coldStarts} cold start(s)` : undefined}
        />
      </div>

      {isLoading && <Skeleton className="h-72" />}

      {data && data.totals.calls === 0 && (
        <EmptyState
          icon={BarChart3}
          title="No model calls in this period"
          description="Metrics appear as soon as CodeMind uses the local models: connect a repository, fetch commits, or ask a question."
        />
      )}

      {data && data.totals.calls > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calls and latency over time</CardTitle>
                <CardDescription>Per {data.bucket}</CardDescription>
              </CardHeader>
              <CardContent className="h-64 px-2 sm:px-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.timeseries} margin={{ left: -10, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="bucket" tickFormatter={bucketLabel} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis yAxisId="calls" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
                    <YAxis yAxisId="ms" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v: number) => fmtMs(v)} />
                    <Tooltip {...chartTooltip} labelFormatter={(v) => bucketLabel(String(v))} formatter={(value, name) => (name === 'Avg latency' ? fmtMs(Number(value)) : value)} />
                    <Line yAxisId="calls" type="monotone" dataKey="calls" name="Calls" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    <Line yAxisId="ms" type="monotone" dataKey="avgLatencyMs" name="Avg latency" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average latency by feature</CardTitle>
                <CardDescription>Wall-clock time per call</CardDescription>
              </CardHeader>
              <CardContent className="h-64 px-2 sm:px-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byOperation.map((o) => ({ ...o, label: OPERATION_LABELS[o.operation] ?? o.operation }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => fmtMs(v)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <Tooltip {...chartTooltip} formatter={(value) => fmtMs(Number(value))} />
                    <Bar dataKey="avgLatencyMs" name="Avg latency" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {data.byModel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparison by model</CardTitle>
                <CardDescription>
                  Chat models only. Local models report exact timings; for cloud models without timing data, speed is end-to-end (includes network).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Where</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Tokens in</TableHead>
                      <TableHead className="text-right">Tokens out</TableHead>
                      <TableHead className="text-right">Avg speed</TableHead>
                      <TableHead className="text-right">Avg latency</TableHead>
                      <TableHead className="text-right">p95</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byModel.map((m) => (
                      <TableRow key={`${m.provider}:${m.model}`}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{m.model}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {m.provider === 'ollama' ? (
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Local</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-500">Cloud · {m.provider}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.calls}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', m.errors > 0 && 'text-red-500')}>{m.errors}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.promptTokens ? fmtNum(m.promptTokens) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.completionTokens ? fmtNum(m.completionTokens) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.avgTokensPerSecond ? `${m.avgTokensPerSecond} tok/s` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(m.avgLatencyMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(m.p95LatencyMs)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Breakdown by feature</CardTitle>
              <CardDescription>Tokens and speed are reported by Ollama for LLM calls; embeddings report latency only.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Tokens in</TableHead>
                      <TableHead className="text-right">Tokens out</TableHead>
                      <TableHead className="text-right">Avg speed</TableHead>
                      <TableHead className="text-right">Avg latency</TableHead>
                      <TableHead className="text-right">p95</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byOperation.map((o) => (
                      <TableRow key={o.operation}>
                        <TableCell className="whitespace-nowrap font-medium">{OPERATION_LABELS[o.operation] ?? o.operation}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.calls}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', o.errors > 0 && 'text-red-500')}>{o.errors}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.promptTokens ? fmtNum(o.promptTokens) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.completionTokens ? fmtNum(o.completionTokens) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.avgTokensPerSecond ? `${o.avgTokensPerSecond} tok/s` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(o.avgLatencyMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(o.p95LatencyMs)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent calls</CardTitle>
              <CardDescription>
                Load = loading the model into memory (cold start) · Prompt = reading the input · Generate = writing the output
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">In / out tokens</TableHead>
                      <TableHead className="text-right">Speed</TableHead>
                      <TableHead className="text-right">Load</TableHead>
                      <TableHead className="text-right">Prompt</TableHead>
                      <TableHead className="text-right">Generate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="whitespace-nowrap">{OPERATION_LABELS[c.operation] ?? c.operation}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{c.model}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {c.promptTokens != null ? `${c.promptTokens} / ${c.completionTokens ?? 0}` : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{c.tokensPerSecond ? `${c.tokensPerSecond} tok/s` : '—'}</TableCell>
                        <TableCell className={cn('whitespace-nowrap text-right tabular-nums', (c.loadDurationMs ?? 0) > 1000 && 'text-sky-400')}>
                          {(c.loadDurationMs ?? 0) > 1000 && <Snowflake className="mr-1 inline size-3" />}
                          {fmtMs(c.loadDurationMs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(c.promptEvalMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(c.evalMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMs(c.latencyMs)}</TableCell>
                        <TableCell>
                          {c.success ? (
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">OK</Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-500/40 text-red-500" title={c.error ?? ''}>Error</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Cpu className="mt-0.5 size-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              The same measurements are exported in Prometheus format at <code className="rounded bg-muted px-1">/api/metrics</code> and charted in Grafana when running the monitoring stack.
            </p>
          </div>
          <a href="http://localhost:3030" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm hover:underline">
            Open Grafana <ExternalLink className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
