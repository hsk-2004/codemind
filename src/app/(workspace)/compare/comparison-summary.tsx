'use client'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMs } from '@/components/codemind/answer-panel'
import type { AnswerMeta } from '@/lib/ask-types'
import { modelSizeLabel, parseModelKey } from '@/lib/compare'

export interface Finished {
  key: string
  meta: AnswerMeta
  sizeBytes?: number
}

// One colour per model, so the same model is the same colour in every chart.
const COLORS = ['#38bdf8', '#f59e0b', '#34d399', '#a78bfa']
const shortName = (model: string) => (model.length > 16 ? `${model.slice(0, 15)}…` : model)

function MetricChart({ title, description, data, unit }: { title: string; description: string; data: { name: string; value: number }[]; unit: string }) {
  const config = { value: { label: title } } satisfies ChartConfig
  return (
    <Card className="gap-fluid-sm py-fluid-md">
      <CardHeader className="px-fluid-md">
        <CardTitle className="text-fluid-base">{title}</CardTitle>
        <CardDescription className="text-fluid-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-fluid-sm">
        {/* aspect-chart keeps every chart at the same 16:9 shape, whatever the screen width. */}
        <ChartContainer config={config} className="aspect-chart w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={44} unit={unit} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={4}>
              {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/** Charts and a table that put the finished answers next to each other. */
export function ComparisonSummary({ rows }: { rows: Finished[] }) {
  if (rows.length < 2) return null
  const names = rows.map((row) => shortName(parseModelKey(row.key).model))
  const series = (value: (meta: AnswerMeta) => number | undefined) => rows.map((row, i) => ({ name: names[i]!, value: value(row.meta) ?? 0 }))

  const lines: { label: string; cell: (row: Finished) => string }[] = [
    { label: 'Runs', cell: (r) => (r.meta.location === 'cloud' ? `In the cloud (${r.meta.providerLabel})` : 'On this computer') },
    { label: 'Model size', cell: (r) => modelSizeLabel({ provider: r.meta.provider, model: r.meta.model, sizeBytes: r.sizeBytes }) },
    { label: 'First word', cell: (r) => (r.meta.firstTokenMs != null ? formatMs(r.meta.firstTokenMs) : '—') },
    { label: 'Total time', cell: (r) => formatMs(r.meta.totalMs) },
    { label: 'Writing speed', cell: (r) => (r.meta.tokensPerSecond != null ? `${r.meta.tokensPerSecond} tok/s` : '—') },
    { label: 'Tokens in / out', cell: (r) => (r.meta.promptTokens != null ? `${r.meta.promptTokens} / ${r.meta.completionTokens ?? 0}` : '—') },
    { label: 'Answer size', cell: (r) => `${r.meta.answerWords} words · ${r.meta.answerChars} characters` },
    { label: 'Code excerpts read', cell: (r) => String(r.meta.sourcesUsed) },
  ]

  return (
    <section className="space-y-fluid-md" aria-label="Comparison summary">
      <h2 className="text-fluid-lg font-semibold">Side by side</h2>
      <div className="grid gap-fluid-md sm:grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
        <MetricChart title="Total time" description="Lower is faster." data={series((m) => Math.round(m.totalMs / 100) / 10)} unit="s" />
        <MetricChart title="Writing speed" description="Tokens per second. Higher is faster." data={series((m) => m.tokensPerSecond)} unit="" />
        <MetricChart title="Answer size" description="Words in the answer." data={series((m) => m.answerWords)} unit="" />
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36" />
              {rows.map((row, i) => (
                <TableHead key={row.key} className="min-w-40 whitespace-normal text-fluid-sm">
                  <span className="mr-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: COLORS[i % COLORS.length] }} />
                  {parseModelKey(row.key).model}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.label}>
                <TableCell className="text-fluid-xs font-medium text-muted-foreground">{line.label}</TableCell>
                {rows.map((row) => <TableCell key={row.key} className="whitespace-normal text-fluid-sm tabular-nums">{line.cell(row)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}
