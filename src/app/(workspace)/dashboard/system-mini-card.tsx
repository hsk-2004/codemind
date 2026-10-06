'use client'
import Link from 'next/link'
import { Activity, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/codemind/status-badge'
import { api } from '@/trpc/react'

export function SystemMiniCard() {
  const { data } = api.system.status.useQuery(undefined, { refetchInterval: 60_000, staleTime: 30_000 })

  const rows = [
    { label: 'Ollama runtime', ok: data?.ollama.ok, detail: data?.ollama.latencyMs != null ? `${data.ollama.latencyMs}ms` : undefined },
    { label: 'LLM', ok: data?.llm.installed, detail: data ? `${data.llm.model} · ${data.llm.providerLabel}` : undefined },
    { label: 'Embeddings', ok: data?.embedding.installed, detail: data?.embedding.model },
    { label: 'PostgreSQL + pgvector', ok: data?.database.ok, detail: data?.database.pgvectorVersion ? `v${data.database.pgvectorVersion}` : undefined },
  ]

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="size-4" /> AI stack</CardTitle>
        <CardDescription>
          {data?.llm.location === 'cloud'
            ? `Chat model runs in the cloud (${data.llm.providerLabel}). Embeddings and search stay local.`
            : 'Everything runs on this machine. No code leaves it.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm">{row.label}</p>
              {row.detail && <p className="truncate font-mono text-xs text-muted-foreground">{row.detail}</p>}
            </div>
            <StatusBadge ok={row.ok} okLabel={row.label === 'LLM' || row.label === 'Embeddings' ? 'Ready' : 'Online'} failLabel={row.label === 'LLM' || row.label === 'Embeddings' ? 'Missing' : 'Offline'} />
          </div>
        ))}
        <Link href="/system" className="inline-flex items-center gap-1 pt-1 text-sm text-muted-foreground hover:text-foreground">
          Full system status <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}
