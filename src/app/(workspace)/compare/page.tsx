'use client'
import { AlertTriangle, Columns3, Loader2, Play, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Explainer } from '@/components/codemind/explainer'
import { PageHeader } from '@/components/codemind/page-header'
import { RequireProject } from '@/components/codemind/require-project'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { applyEvent, pendingResult, stopResult, streamAsk, type AskResult } from '@/lib/ask-client'
import { parseModelKey, pickWinners } from '@/lib/compare'
import { api } from '@/trpc/react'
import { ComparisonSummary, type Finished } from './comparison-summary'
import { ModelColumn, type ColumnState } from './model-column'
import { ModelPicker, defaultSelection, findModel } from './model-picker'

const EXAMPLES = [
  'What are the main parts of this project and what does each do?',
  'How does a request travel through this codebase?',
  'Where could a bug most likely hide, and why?',
]

function CompareView({ projectId }: { projectId: string }) {
  const { data: catalog, isLoading } = api.models.list.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false })
  const [selected, setSelected] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [runs, setRuns] = useState<Record<string, AskResult>>({})
  const [queued, setQueued] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Start with each provider's default model, once the catalog is known.
  useEffect(() => {
    if (catalog && selected.length === 0) setSelected(defaultSelection(catalog))
  }, [catalog, selected.length])

  const usesCloud = selected.some((key) => parseModelKey(key).provider !== 'ollama')

  const run = async () => {
    const q = question.trim()
    if (!q || running || selected.length < 2) return
    const keys = [...selected]
    const controller = new AbortController()
    abortRef.current = controller
    setAsked(q)
    setRunning(true)
    setRuns(Object.fromEntries(keys.map((key) => [key, pendingResult('rag')])))

    const ask = async (key: string) => {
      if (controller.signal.aborted) return
      setQueued((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      // The clock of a model that had to wait starts when its own turn starts.
      setRuns((prev) => ({ ...prev, [key]: pendingResult('rag') }))
      await streamAsk({ question: q, projectId, mode: 'rag', model: parseModelKey(key) }, (event) => setRuns((prev) => (prev[key] ? { ...prev, [key]: applyEvent(prev[key], event) } : prev)), controller.signal)
    }

    // Cloud models answer at the same time. Local models share one GPU, so they take turns.
    const local = keys.filter((key) => parseModelKey(key).provider === 'ollama')
    const cloud = keys.filter((key) => parseModelKey(key).provider !== 'ollama')
    setQueued(new Set(local.slice(1)))
    try {
      await Promise.all([
        (async () => {
          for (const key of local) await ask(key)
        })(),
        ...cloud.map(ask),
      ])
    } finally {
      setQueued(new Set())
      setRunning(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRuns((prev) => Object.fromEntries(Object.entries(prev).map(([key, result]) => [key, stopResult(result)])))
    setQueued(new Set())
    setRunning(false)
  }

  const keys = Object.keys(runs)
  const finished: Finished[] = useMemo(
    () => keys.flatMap((key) => (runs[key]?.status === 'done' && runs[key]?.meta ? [{ key, meta: runs[key]!.meta!, sizeBytes: findModel(catalog, key)?.sizeBytes }] : [])),
    [keys, runs, catalog],
  )
  const winners = useMemo(() => pickWinners(finished), [finished])

  return (
    <div className="space-y-fluid-lg">
      <PageHeader
        title="Compare models"
        description="Ask one question and watch a local model, Gemini and Groq answer it side by side, with speed, size and length measured."
      />

      <Explainer
        id="compare"
        steps={[
          { title: 'Pick the models', text: 'Choose two to four. Local models run on this computer. Cloud models run on the provider’s servers.' },
          { title: 'Ask once', text: 'Every model gets the same question and searches the same repository index for code to read.' },
          { title: 'Read the numbers', text: 'First word is how quickly it starts. Total time is the whole answer. tok/s is writing speed. Size is the model on disk, or its parameter count.' },
        ]}
        note="Each model is given as much code as its context window can hold, so a model with a bigger window may read more of the repository. That difference is part of what you are comparing."
      />

      {isLoading && <Skeleton className="h-40" />}

      {catalog && (
        <Card>
          <CardContent className="space-y-fluid-md">
            <div>
              <h2 className="mb-fluid-xs text-fluid-base font-semibold">1. Models</h2>
              <ModelPicker catalog={catalog} selected={selected} onChange={setSelected} disabled={running} />
              {usesCloud && (
                <p className="mt-fluid-sm flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-fluid-sm text-fluid-xs text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Cloud models receive short excerpts of this repository&apos;s code inside the prompt. Remove them to keep everything on this computer.
                </p>
              )}
            </div>

            <div>
              <h2 className="mb-fluid-xs text-fluid-base font-semibold">2. Question</h2>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask something about the repository…"
                disabled={running}
                className="min-h-20 resize-none text-fluid-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void run()
                  }
                }}
              />
              <div className="mt-fluid-xs flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={running}
                    onClick={() => setQuestion(example)}
                    className="rounded-full border px-3 py-1 text-left text-fluid-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {running ? (
              <Button variant="destructive" onClick={stop} className="w-full sm:w-auto"><Square /> Stop all</Button>
            ) : (
              <Button onClick={() => void run()} disabled={!question.trim() || selected.length < 2} className="w-full sm:w-auto">
                <Play /> Compare {selected.length} models
              </Button>
            )}
            {selected.length < 2 && <p className="text-fluid-xs text-muted-foreground">Pick at least two models. Cloud models need an API key in .env.</p>}
          </CardContent>
        </Card>
      )}

      {keys.length > 0 && (
        <section className="space-y-fluid-md" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-fluid-lg font-semibold">&ldquo;{asked}&rdquo;</h2>
            {running && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {/* Columns share the width equally and wrap by themselves: no breakpoints, so they follow the sidebar opening and closing. */}
          <div className="grid items-stretch gap-fluid-md grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
            {keys.map((key) => {
              const result = runs[key]!
              const state: ColumnState = queued.has(key) ? 'queued' : result.status
              return <ModelColumn key={key} modelKey={key} state={state} result={result} sizeBytes={findModel(catalog, key)?.sizeBytes} winners={winners} />
            })}
          </div>
          <ComparisonSummary rows={finished} />
        </section>
      )}

      {keys.length === 0 && catalog && (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-fluid-lg text-center text-muted-foreground">
          <Columns3 className="mb-2 size-6" />
          <p className="text-fluid-sm">The answers will appear here, side by side, as they are written.</p>
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return <RequireProject>{(project) => <CompareView projectId={project.id} />}</RequireProject>
}
