'use client'
import MDEditor from '@uiw/react-md-editor'
import { Clock, Cloud, Cpu, Database, FileCode2, Hash, Loader2, ShieldAlert, ShieldCheck, ShieldOff, Sparkles, Square, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import Codereferences from '@/app/(workspace)/dashboard/code-references'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AskResult } from '@/lib/ask-client'
import type { AnswerMeta, AnswerMode } from '@/lib/ask-types'
import { cn } from '@/lib/utils'

export const formatMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

const TITLES: Record<AnswerMode, string> = {
  rag: 'With RAG',
  direct: 'Without RAG',
  auto: 'Small local model',
  escalate: 'Scaled up: larger model',
}

export function ElapsedTimer({ since }: { since: number }) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.round((Date.now() - since) / 1000)))
  useEffect(() => {
    const id = setInterval(() => setSeconds(Math.max(0, Math.round((Date.now() - since) / 1000))), 1000)
    return () => clearInterval(id)
  }, [since])
  return <span className="tabular-nums">{seconds}s</span>
}

/** Timings, tokens and where the model ran, as small labelled chips. */
export function MetaBadges({ meta }: { meta: AnswerMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {meta.mode === 'direct' ? (
        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground"><ShieldOff className="size-3" /> No repository code given</Badge>
      ) : meta.grounded ? (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500"><ShieldCheck className="size-3" /> Grounded in {meta.sourcesUsed} source{meta.sourcesUsed === 1 ? '' : 's'}</Badge>
      ) : (
        <Badge variant="outline" className="border-amber-500/40 text-amber-500"><ShieldAlert className="size-3" /> No relevant code found</Badge>
      )}
      {meta.mode === 'escalate' && (
        <Badge variant="outline" className="border-violet-500/40 text-violet-400"><TrendingUp className="size-3" /> Scaled up</Badge>
      )}
      <Badge variant="secondary">
        {meta.location === 'cloud' ? <Cloud className="size-3 text-amber-500" /> : <Cpu className="size-3 text-emerald-500" />}
        {meta.model} · {meta.location === 'cloud' ? meta.providerLabel : 'local'}
      </Badge>
      {meta.historyTurns > 0 && (
        <Badge variant="outline" className="border-sky-500/40 text-sky-400" title="This answer used the earlier questions of the conversation">
          Follow-up · {meta.historyTurns} earlier
        </Badge>
      )}
      {meta.mode !== 'direct' && meta.retrievalMs > 0 && <Badge variant="secondary"><Database className="size-3" /> Retrieval {formatMs(meta.retrievalMs)}</Badge>}
      {meta.retrievalLevel === 'function' && (
        <Badge variant="outline" className="border-sky-500/40 text-sky-400" title="Matched individual functions and classes, not whole files">
          {meta.retrievalMode === 'hybrid' ? 'Function-level · hybrid' : 'Function-level'}
        </Badge>
      )}
      {meta.firstTokenMs != null && <Badge variant="secondary" title="Time until the first word appeared"><Sparkles className="size-3" /> First word {formatMs(meta.firstTokenMs)}</Badge>}
      {meta.generationMs > 0 && <Badge variant="secondary"><Sparkles className="size-3" /> Generation {formatMs(meta.generationMs)}</Badge>}
      <Badge variant="secondary"><Clock className="size-3" /> Total {formatMs(meta.totalMs)}</Badge>
      {meta.promptTokens != null && (
        <Badge variant="secondary"><Hash className="size-3" /> {meta.promptTokens} in · {meta.completionTokens ?? 0} out tokens</Badge>
      )}
      {meta.tokensPerSecond != null && <Badge variant="secondary"><Zap className="size-3" /> {meta.tokensPerSecond} tok/s</Badge>}
      {meta.loadDurationMs != null && meta.loadDurationMs > 1000 && (
        <Badge variant="outline" className="border-sky-500/40 text-sky-400" title="The model had to be loaded into memory first">
          Cold start {formatMs(meta.loadDurationMs)}
        </Badge>
      )}
    </div>
  )
}

/** The answer, written live. Sources appear first, the words follow, then the details. */
export function AnswerMarkdown({ source, streaming }: { source: string; streaming: boolean }) {
  return (
    <div data-color-mode="dark" className="text-fluid-sm">
      <MDEditor.Markdown source={source} style={{ background: 'transparent', fontSize: 'inherit' }} />
      {streaming && <span aria-hidden className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />}
    </div>
  )
}

export function StatusLine({ result, loadingText }: { result: AskResult; loadingText: string }) {
  const found = result.filesReferences.length
  return (
    <div className="rounded-lg border p-fluid-md">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0">
          <p className="text-fluid-sm font-medium">
            {result.retrievalMs != null
              ? found > 0
                ? `Found ${found} source${found === 1 ? '' : 's'}. Waiting for the first word…`
                : 'No relevant code found. Preparing the reply…'
              : loadingText}
          </p>
          <p className="text-fluid-xs text-muted-foreground">Elapsed: <ElapsedTimer since={result.startedAt} /></p>
        </div>
      </div>
    </div>
  )
}

export function AnswerPanel({
  result,
  showTitle,
  onEscalate,
  onStop,
}: {
  result: AskResult
  showTitle: boolean
  onEscalate?: () => void
  onStop?: () => void
}) {
  const suggestion = result.meta?.suggestion
  const loadingText =
    result.mode === 'direct'
      ? 'Asking the model without repository code…'
      : result.mode === 'escalate'
        ? 'Asking the larger model with the same retrieved code…'
        : 'Searching the repository for relevant code…'

  return (
    <section className="min-w-0 space-y-fluid-md">
      {showTitle && (
        <h3 className="flex items-center gap-2 border-b pb-2 text-fluid-sm font-semibold">
          {result.mode === 'direct' ? <ShieldOff className="size-4 text-muted-foreground" /> : result.mode === 'escalate' ? <TrendingUp className="size-4 text-violet-400" /> : <ShieldCheck className="size-4 text-emerald-500" />}
          {TITLES[result.mode]}
        </h3>
      )}

      {result.status === 'loading' && <StatusLine result={result} loadingText={loadingText} />}

      {result.status === 'error' && (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 p-fluid-md text-fluid-sm text-red-400">{result.output}</div>
      )}

      {(result.status === 'streaming' || result.status === 'stopped' || result.status === 'done') && (
        <>
          {result.status === 'done' && result.meta && <MetaBadges meta={result.meta} />}
          {result.status === 'streaming' && (
            <div className="flex items-center justify-between gap-2 text-fluid-xs text-muted-foreground">
              <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Writing the answer · <ElapsedTimer since={result.startedAt} /></span>
              {onStop && <Button size="sm" variant="outline" onClick={onStop}><Square className="size-3" /> Stop</Button>}
            </div>
          )}
          <AnswerMarkdown source={result.output} streaming={result.status === 'streaming'} />
          {result.status === 'stopped' && <p className="rounded-md border bg-muted/30 p-3 text-fluid-xs text-muted-foreground">Stopped before the answer was finished.</p>}
          {result.status === 'done' && onEscalate && suggestion && (
            <div className={cn('rounded-lg border p-fluid-md text-fluid-sm', suggestion.reason ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/30')}>
              <p className="font-medium">{suggestion.reason ? 'This answer may be weak. Scaling up is recommended.' : 'Not satisfied with this answer?'}</p>
              {suggestion.reason && <p className="mt-1 text-muted-foreground">Reason: {suggestion.reason}.</p>}
              <p className="mt-1 text-muted-foreground">
                Re-ask with the larger <span className="font-medium text-foreground">{suggestion.to.model}</span> ({suggestion.to.providerLabel}, cloud), using the same retrieved code. The code excerpts will be sent to {suggestion.to.providerLabel}.
              </p>
              <Button size="sm" className="mt-3" variant={suggestion.reason ? 'default' : 'outline'} onClick={onEscalate}>
                <TrendingUp /> Scale up to {suggestion.to.model}
              </Button>
            </div>
          )}
          {result.status === 'done' && result.meta?.keptLocalReason && (
            <p className="rounded-md border bg-muted/30 p-3 text-fluid-xs text-muted-foreground">{result.meta.keptLocalReason}</p>
          )}
        </>
      )}

      {/* Sources are known as soon as retrieval ends, so they are shown while the answer is still being written. */}
      {result.filesReferences.length > 0 && result.status !== 'error' && (
        <div className="border-t pt-fluid-md">
          <h4 className="mb-3 flex items-center gap-2 text-fluid-sm font-semibold">
            <FileCode2 className="size-4" /> Sources ({result.filesReferences.length})
          </h4>
          <Codereferences
            fileReferences={result.filesReferences.map((file) => ({
              filename: file.fileName,
              sourceCode: file.sourceCode,
              summary: file.summary,
              similarity: file.similarity,
            }))}
          />
        </div>
      )}
    </section>
  )
}
