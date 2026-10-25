'use client'
import { Clock, Cloud, Cpu, FileText, Loader2, Sparkles, Trophy, Zap } from 'lucide-react'
import { AnswerMarkdown, ElapsedTimer, formatMs } from '@/components/codemind/answer-panel'
import { Badge } from '@/components/ui/badge'
import type { AskResult } from '@/lib/ask-client'
import { modelSizeLabel, parseModelKey, type Winners } from '@/lib/compare'
import { cn } from '@/lib/utils'

export type ColumnState = 'queued' | AskResult['status']

function Stat({ icon: Icon, label, value, won }: { icon: typeof Clock; label: string; value: string; won?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-background/60 p-2', won && 'border-emerald-500/50 bg-emerald-500/5')}>
      <p className="flex items-center gap-1 text-fluid-xs text-muted-foreground">
        <Icon className="size-3" /> {label}
        {won && <Trophy className="ml-auto size-3 text-emerald-500" aria-label="Best of the group" />}
      </p>
      <p className="text-fluid-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** One model's answer, written live, with the numbers that make it comparable to the others. */
export function ModelColumn({ modelKey, state, result, sizeBytes, winners }: { modelKey: string; state: ColumnState; result: AskResult; sizeBytes?: number; winners: Winners }) {
  const { provider, model } = parseModelKey(modelKey)
  const meta = result.meta
  const cloud = provider !== 'ollama'
  const running = state === 'loading' || state === 'streaming'

  return (
    <article className="flex min-w-0 flex-col gap-fluid-sm rounded-xl border bg-card p-fluid-md shadow-sm">
      <header className="flex items-start gap-2">
        {cloud ? <Cloud className="mt-0.5 size-4 shrink-0 text-amber-500" /> : <Cpu className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-fluid-base font-semibold leading-tight">{model}</h3>
          <p className="text-fluid-xs text-muted-foreground">
            {cloud ? provider === 'gemini' ? 'Google Gemini · cloud' : 'Groq · cloud' : 'Ollama · runs on this computer'}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 whitespace-normal text-center text-[0.7rem]">{modelSizeLabel({ provider, model, sizeBytes })}</Badge>
      </header>

      <div className="grid grid-cols-2 gap-fluid-xs">
        <Stat icon={Sparkles} label="First word" value={meta?.firstTokenMs != null ? formatMs(meta.firstTokenMs) : '…'} won={winners.firstWord === modelKey} />
        <Stat icon={Clock} label="Total time" value={meta ? formatMs(meta.totalMs) : running ? 'running' : '…'} won={winners.total === modelKey} />
        <Stat icon={Zap} label="Speed" value={meta?.tokensPerSecond != null ? `${meta.tokensPerSecond} tok/s` : '…'} won={winners.speed === modelKey} />
        <Stat icon={FileText} label="Answer size" value={meta ? `${meta.answerWords} words` : result.output ? `${result.output.trim().split(/\s+/).length} words` : '…'} won={winners.longest === modelKey} />
      </div>

      {/* The answer area keeps one height range for every model, so the columns line up. */}
      <div className="min-h-48 max-h-[min(55dvh,30rem)] flex-1 overflow-y-auto rounded-lg border bg-background/40 p-fluid-sm">
        {state === 'queued' && <p className="text-fluid-sm text-muted-foreground">Waiting for the other local model to finish. A small local GPU runs one model at a time.</p>}
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-fluid-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {result.retrievalMs != null ? 'Waiting for the first word…' : 'Searching the repository…'} <ElapsedTimer since={result.startedAt} />
          </p>
        )}
        {state === 'error' && <p role="alert" className="text-fluid-sm text-red-400">{result.output}</p>}
        {(state === 'streaming' || state === 'done' || state === 'stopped') && <AnswerMarkdown source={result.output} streaming={state === 'streaming'} />}
        {state === 'stopped' && <p className="mt-2 text-fluid-xs text-muted-foreground">Stopped before the answer was finished.</p>}
      </div>

      {meta && (
        <p className="text-fluid-xs text-muted-foreground">
          Used {meta.sourcesUsed} source{meta.sourcesUsed === 1 ? '' : 's'} · {meta.promptTokens != null ? `${meta.promptTokens} tokens in, ${meta.completionTokens ?? 0} out` : 'token counts not reported'}
        </p>
      )}
    </article>
  )
}
