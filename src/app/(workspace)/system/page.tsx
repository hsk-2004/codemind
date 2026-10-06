'use client'
import { Brain, Cpu, Database, HardDrive, Layers, RefreshCw, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/codemind/page-header'
import { StatusBadge } from '@/components/codemind/status-badge'
import { api } from '@/trpc/react'

const formatBytes = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`)

function ServiceCard({ icon, title, ok, detail, latency, extra }: {
  icon: ReactNode; title: string; ok: boolean | undefined; detail?: string; latency?: number | null; extra?: ReactNode
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">{icon}{title}</CardTitle>
          <StatusBadge ok={ok} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-4 text-sm">
        {detail ? <p className="text-muted-foreground">{detail}</p> : <Skeleton className="h-4 w-40" />}
        {latency != null && <p className="text-xs text-muted-foreground">Response time: {latency}ms</p>}
        {extra}
      </CardContent>
    </Card>
  )
}

// Measured manually on the development machine with the same question against
// the same indexed repository. Not a statistical benchmark.
const MODEL_COMPARISON = [
  { model: 'qwen3:4b', size: '2.5 GB', fitsVram: 'Partly (2.3 of 3.4 GB)', tokens: 724, speed: '~25 tok/s', answerTime: '~30 s', notes: 'Accurate, but leaks its reasoning into answers and can return empty output', chosen: false },
  { model: 'qwen3:1.7b', size: '1.4 GB', fitsVram: 'Yes', tokens: 148, speed: '~83 tok/s', answerTime: '~16 s', notes: 'Fast, but hedged and less precise answers', chosen: false },
  { model: 'qwen2.5-coder:3b-instruct', size: '1.9 GB', fitsVram: 'Yes', tokens: 203, speed: '~14 tok/s*', answerTime: '~30 s*', notes: 'Code-specialised, answers directly with no reasoning leakage', chosen: true },
]

export default function SystemPage() {
  const { data, isFetching, refetch } = api.system.status.useQuery(undefined, { refetchInterval: 30_000 })

  return (
    <div className="space-y-6">
      <PageHeader
        title="System status"
        description="Live health of the local AI stack. Refreshes every 30 seconds."
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ServiceCard icon={<Server className="size-4" />} title="Ollama runtime" ok={data?.ollama.ok} detail={data?.ollama.detail} latency={data?.ollama.latencyMs} />
        <ServiceCard
          icon={<Brain className="size-4" />}
          title="Language model"
          ok={data?.llm.installed}
          detail={data ? `${data.llm.model}${data.llm.installed ? '' : data.llm.location === 'cloud' ? ' — API key missing' : ' — not installed'}` : undefined}
          extra={data && (
            <p className="text-xs text-muted-foreground">
              {data.llm.location === 'cloud'
                ? `${data.llm.providerLabel} (cloud): prompts and code are sent to this provider`
                : `Ollama (local) · context window ${data.llm.numCtx} tokens`}
            </p>
          )}
        />
        <ServiceCard
          icon={<Layers className="size-4" />}
          title="Embedding model"
          ok={data?.embedding.installed}
          detail={data ? `${data.embedding.model}${data.embedding.installed ? '' : ' — not installed'}` : undefined}
          extra={<p className="text-xs text-muted-foreground">768-dimensional vectors</p>}
        />
        <ServiceCard icon={<Database className="size-4" />} title="PostgreSQL + pgvector" ok={data?.database.ok} detail={data?.database.detail} latency={data?.database.latencyMs} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HardDrive className="size-4" /> Installed models</CardTitle>
            <CardDescription>Models currently available in the local Ollama runtime.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data && <Skeleton className="h-24" />}
            {data && data.ollama.models.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {data.ollama.ok ? 'No models installed. Run: ollama pull qwen2.5-coder:3b-instruct && ollama pull nomic-embed-text' : 'Ollama is not reachable. Start the Ollama app or run "ollama serve".'}
              </p>
            )}
            {data && data.ollama.models.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ollama.models.map((m) => {
                    const base = m.name.replace(/:latest$/, '')
                    const role = base === data.llm.model ? 'LLM (answers, summaries, breaking changes)' : base === data.embedding.model ? 'Embeddings (retrieval)' : 'Unused'
                    return (
                      <TableRow key={m.name}>
                        <TableCell className="font-mono text-xs">{m.name}</TableCell>
                        <TableCell className="tabular-nums">{formatBytes(m.sizeBytes)}</TableCell>
                        <TableCell className="text-muted-foreground">{role}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cpu className="size-4" /> Vector store and cloud providers</CardTitle>
            <CardDescription>Retrieval runs on pgvector. Cloud chat models are optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>pgvector (active)</span>
              <StatusBadge ok={data ? !!data.database.pgvectorVersion : undefined} />
            </div>
            <div className="flex items-center justify-between">
              <span>Qdrant (provisioned)</span>
              <StatusBadge ok={data?.qdrant.ok} />
            </div>
            {data?.cloud.map((c) => (
              <div key={c.provider} className="flex items-center justify-between">
                <span>{c.label} API key</span>
                <StatusBadge ok={c.configured} okLabel="Configured" failLabel="Not set" />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Qdrant is running for the planned function-level chunk index.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model evaluation</CardTitle>
          <CardDescription>
            Same question, same indexed repository. Development machine: NVIDIA GTX 1650 (4 GB VRAM), 16 GB RAM, Ryzen 5 4600H.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Fits in VRAM</TableHead>
                <TableHead className="text-right">Tokens generated</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Answer time (warm)</TableHead>
                <TableHead>Observation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODEL_COMPARISON.map((row) => (
                <TableRow key={row.model} className={row.chosen ? 'bg-emerald-500/5' : ''}>
                  <TableCell className="font-mono text-xs">
                    {row.model} {row.chosen && <Badge className="ml-1">Chosen</Badge>}
                  </TableCell>
                  <TableCell>{row.size}</TableCell>
                  <TableCell>{row.fitsVram}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.tokens}</TableCell>
                  <TableCell>{row.speed}</TableCell>
                  <TableCell>{row.answerTime}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{row.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            * Measured while other services competed for system resources, so these figures are pessimistic. The model was chosen mainly for reliable, direct answers rather than raw speed.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
