'use client'
import { Box, Braces, Check, Copy, FunctionSquare, Loader2, RefreshCw, Sparkles, Square } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AnswerMarkdown, ElapsedTimer, formatMs } from '@/components/codemind/answer-panel'
import { InfoTip } from '@/components/codemind/info-tip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { FileSymbol } from '@/lib/ask-types'
import { VISIBLE_SYMBOLS, type ExplainState } from '@/lib/explain-client'
import { cn } from '@/lib/utils'

const KIND_ICON = { function: FunctionSquare, class: Box, method: Braces } as const
const KIND_LABEL = { function: 'function', class: 'class', method: 'method' } as const

function SymbolList({ symbols }: { symbols: FileSymbol[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? symbols : symbols.slice(0, VISIBLE_SYMBOLS)
  if (symbols.length === 0) {
    return <p className="text-fluid-xs text-muted-foreground">No functions or classes were found by the scan. This may be a configuration, text or data file.</p>
  }
  return (
    <div>
      <ul className="flex flex-wrap gap-fluid-xs">
        {shown.map((symbol) => {
          const Icon = KIND_ICON[symbol.kind]
          return (
            <li key={`${symbol.name}:${symbol.line}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-fluid-xs" title={`${KIND_LABEL[symbol.kind]} on line ${symbol.line}`}>
              <Icon className={cn('size-3 shrink-0', symbol.kind === 'class' ? 'text-amber-500' : symbol.kind === 'method' ? 'text-sky-400' : 'text-emerald-500')} />
              <span className="truncate font-mono">{symbol.name}</span>
              <span className="shrink-0 text-muted-foreground">:{symbol.line}</span>
            </li>
          )
        })}
      </ul>
      {symbols.length > VISIBLE_SYMBOLS && (
        <Button size="sm" variant="link" className="mt-1 h-auto p-0 text-fluid-xs" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${symbols.length}`}
        </Button>
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  state: ExplainState | undefined
  onExplain: () => void
  onStop: () => void
}

/** A side panel that explains one file: what it is for, how it works, and the functions inside it. */
export function ExplainSheet({ open, onOpenChange, fileName, state, onExplain, onStop }: Props) {
  const [copied, setCopied] = useState(false)
  const running = state?.status === 'loading' || state?.status === 'streaming'
  const symbols = state?.outline?.symbols ?? []

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state?.output ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copying is not available in this browser.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 sm:max-w-[min(94vw,46rem)]"
        // Do not focus the first help icon on open, which would pop its tooltip up by itself.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b p-fluid-md pr-12">
          <SheetTitle className="flex items-center gap-2 text-fluid-base"><Sparkles className="size-4 shrink-0 text-amber-500" /> Explain this file</SheetTitle>
          <SheetDescription className="break-all font-mono text-fluid-xs">{fileName}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-fluid-md overflow-y-auto p-fluid-md">
          <section aria-label="Functions in this file" className="space-y-fluid-xs">
            <h3 className="flex items-center gap-1.5 text-fluid-sm font-semibold">
              Functions and classes{state?.outline ? ` (${symbols.length})` : ''}
              <InfoTip>Found by scanning the file for declarations, so it is exact and instant. The explanation below is written by the AI model.</InfoTip>
            </h3>
            {state?.outline ? <SymbolList symbols={symbols} /> : <p className="text-fluid-xs text-muted-foreground">Scanning…</p>}
            {state?.outline && <p className="text-fluid-xs text-muted-foreground">{state.outline.lines} lines{state.outline.language ? ` · ${state.outline.language}` : ''}</p>}
          </section>

          <section aria-label="Explanation" className="space-y-fluid-sm border-t pt-fluid-md">
            <h3 className="text-fluid-sm font-semibold">In plain English</h3>
            {!state && <p className="text-fluid-sm text-muted-foreground">Press the button to have the selected model explain this file.</p>}
            {state?.status === 'loading' && (
              <p className="flex items-center gap-2 text-fluid-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Waiting for the first word… <ElapsedTimer since={state.startedAt} />
              </p>
            )}
            {state?.status === 'error' && <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 p-fluid-sm text-fluid-sm text-red-400">{state.output}</p>}
            {state && (state.status === 'streaming' || state.status === 'done' || state.status === 'stopped') && (
              <>
                <AnswerMarkdown source={state.output} streaming={state.status === 'streaming'} />
                {state.status === 'stopped' && <p className="text-fluid-xs text-muted-foreground">Stopped before the explanation was finished.</p>}
              </>
            )}
            {state?.status === 'done' && state.meta && (
              <div className="flex flex-wrap items-center gap-1.5 text-fluid-xs">
                <Badge variant="secondary">{state.meta.model} · {state.meta.location === 'cloud' ? state.meta.providerLabel : 'local'}</Badge>
                {state.meta.firstTokenMs != null && <Badge variant="secondary">First word {formatMs(state.meta.firstTokenMs)}</Badge>}
                <Badge variant="secondary">Total {formatMs(state.meta.totalMs)}</Badge>
                {state.meta.tokensPerSecond != null && <Badge variant="secondary">{state.meta.tokensPerSecond} tok/s</Badge>}
                {state.meta.truncated && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500" title="The model has a small context window, so only the start of a long file was read">
                    Only the first {state.meta.shownLines} lines were read
                  </Badge>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t p-fluid-sm">
          {running ? (
            <Button variant="destructive" onClick={onStop}><Square /> Stop</Button>
          ) : (
            <Button onClick={onExplain}>
              {state ? <RefreshCw /> : <Sparkles />} {state ? 'Explain again' : 'Explain this file'}
            </Button>
          )}
          {state?.status === 'done' && (
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
