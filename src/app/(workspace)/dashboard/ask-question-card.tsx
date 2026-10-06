'use client'
import MDEditor from '@uiw/react-md-editor'
import { Bot, Clock, Cloud, Columns2, Cpu, Database, FileCode2, Hash, Loader2, Save, ShieldAlert, ShieldCheck, ShieldOff, Sparkles, TrendingUp, Zap } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import useProject from '@/hooks/use-project'
import useRefetch from '@/hooks/use-refetch'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'
import { askQuestion, type AnswerMeta, type AnswerMode, type FileReference } from './action'
import Codereferences from './code-references'

const EXAMPLES = [
  'What does this project do?',
  'Where is the main entry point?',
  'How is data stored?',
  'Which files handle the UI?',
]

type AskMode = Exclude<AnswerMode, 'escalate'> | 'compare'

const MODES: { value: AskMode; label: string; hint: string; icon: typeof ShieldCheck }[] = [
  { value: 'rag', label: 'With RAG', hint: 'Retrieves relevant code first, then answers from it.', icon: ShieldCheck },
  { value: 'direct', label: 'Without RAG', hint: 'Asks the model with no repository code, as a baseline.', icon: ShieldOff },
  { value: 'auto', label: 'Auto-scale', hint: 'Answers on the small local model first, then offers to scale up to a larger cloud model. Nothing is sent to the cloud until you approve.', icon: TrendingUp },
  { value: 'compare', label: 'Compare both', hint: 'Runs both and shows the answers side by side.', icon: Columns2 },
]

interface Result {
  mode: AnswerMode
  status: 'loading' | 'done' | 'error'
  output: string
  filesReferences: FileReference[]
  meta: AnswerMeta | null
}

const TITLES: Record<AnswerMode, string> = {
  rag: 'With RAG',
  direct: 'Without RAG',
  auto: 'Small local model',
  escalate: 'Scaled up: larger model',
}

const pending = (mode: AnswerMode): Result => ({ mode, status: 'loading', output: '', filesReferences: [], meta: null })

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{seconds}s</span>
}

const formatMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

function MetaBadges({ meta }: { meta: AnswerMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
      {meta.mode === 'rag' && <Badge variant="secondary"><Database className="size-3" /> Retrieval {formatMs(meta.retrievalMs)}</Badge>}
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

function AnswerPanel({ result, showTitle, onEscalate }: { result: Result; showTitle: boolean; onEscalate?: () => void }) {
  const suggestion = result.meta?.suggestion
  return (
    <section className="min-w-0 space-y-4">
      {showTitle && (
        <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-semibold">
          {result.mode === 'direct' ? <ShieldOff className="size-4 text-muted-foreground" /> : result.mode === 'escalate' ? <TrendingUp className="size-4 text-violet-400" /> : <ShieldCheck className="size-4 text-emerald-500" />}
          {TITLES[result.mode]}
        </h3>
      )}

      {result.status === 'loading' && (
        <div className="rounded-lg border p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div>
              <p className="font-medium">
                {result.mode === 'direct'
                  ? 'Generating an answer without repository code…'
                  : result.mode === 'escalate'
                    ? 'Asking the larger model with the same retrieved code…'
                    : 'Retrieving relevant code and generating an answer…'}
              </p>
              <p className="text-sm text-muted-foreground">Elapsed: <ElapsedTimer /></p>
            </div>
          </div>
        </div>
      )}

      {result.status === 'error' && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-400">{result.output}</div>
      )}

      {result.status === 'done' && (
        <>
          {result.meta && <MetaBadges meta={result.meta} />}
          <div data-color-mode="dark">
            <MDEditor.Markdown source={result.output} style={{ background: 'transparent', fontSize: 14 }} />
          </div>
          {onEscalate && suggestion && (
            <div className={cn('rounded-lg border p-4 text-sm', suggestion.reason ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/30')}>
              <p className="font-medium">
                {suggestion.reason ? 'This answer may be weak. Scaling up is recommended.' : 'Not satisfied with this answer?'}
              </p>
              {suggestion.reason && <p className="mt-1 text-muted-foreground">Reason: {suggestion.reason}.</p>}
              <p className="mt-1 text-muted-foreground">
                Re-ask with the larger <span className="font-medium text-foreground">{suggestion.to.model}</span> ({suggestion.to.providerLabel}, cloud), using the same retrieved code. The code excerpts will be sent to {suggestion.to.providerLabel}.
              </p>
              <Button size="sm" className="mt-3" variant={suggestion.reason ? 'default' : 'outline'} onClick={onEscalate}>
                <TrendingUp /> Scale up to {suggestion.to.model}
              </Button>
            </div>
          )}
          {result.meta?.keptLocalReason && (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">{result.meta.keptLocalReason}</p>
          )}
          {result.filesReferences.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
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
        </>
      )}
    </section>
  )
}

const AskQuestionCard = () => {
  const { project } = useProject()
  const { data: models } = api.models.list.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false })
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AskMode>('rag')
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const saveAnswer = api.project.saveAnswer.useMutation()
  const refetch = useRefetch()

  const loading = results.some((r) => r.status === 'loading')
  const isCompare = results.length > 1

  const run = async (q: string, answerMode: AnswerMode, projectId: string) => {
    try {
      const result = await askQuestion(q, projectId, answerMode)
      setResults((prev) => prev.map((r) => (r.mode === answerMode ? { ...r, status: 'done', output: result.output, filesReferences: result.filesReferences, meta: result.meta } : r)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      setResults((prev) => prev.map((r) => (r.mode === answerMode ? { ...r, status: 'error', output: message } : r)))
    }
  }

  const submit = async (text: string) => {
    const q = text.trim()
    if (!project?.id || !q || loading) return
    const toRun: AnswerMode[] = mode === 'compare' ? ['rag', 'direct'] : [mode]
    setAsked(q)
    setOpen(true)
    saveAnswer.reset()
    setResults(toRun.map(pending))
    // One after the other: a local GPU runs a single generation at a time.
    for (const answerMode of toRun) {
      await run(q, answerMode, project.id)
    }
  }

  const escalate = async () => {
    if (!project?.id || loading) return
    saveAnswer.reset()
    setResults((prev) => [...prev.filter((r) => r.mode !== 'escalate'), pending('escalate')])
    await run(asked, 'escalate', project.id)
  }
  const escalated = results.some((r) => r.mode === 'escalate')

  // Save the grounded answer when there is one, otherwise the only answer shown.
  const savable =
    results.find((r) => r.mode === 'escalate' && r.status === 'done') ??
    results.find((r) => (r.mode === 'rag' || r.mode === 'auto') && r.status === 'done') ??
    results.find((r) => r.status === 'done')

  const handleSaveAnswer = () => {
    if (!project?.id || !savable) return
    saveAnswer.mutate(
      { projectId: project.id, question: asked, answer: savable.output, filesReferences: savable.filesReferences },
      {
        onSuccess: () => {
          toast.success('Answer saved')
          void refetch()
        },
        onError: (e) => toast.error(e.message || 'Failed to save answer'),
      },
    )
  }

  const active = models?.active

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
        <DialogContent className={cn('flex max-h-[90vh] flex-col overflow-hidden p-4 sm:p-6', isCompare ? 'sm:max-w-[95vw]' : 'sm:max-w-5xl')}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="pr-8 text-left text-lg">{asked}</DialogTitle>
            <DialogDescription className="text-left">
              {escalated
                ? 'The same question and retrieved code, answered by the small local model and by a larger cloud model.'
                : results[0]?.mode === 'auto'
                  ? 'Answered by the small local model first. You can scale up to a larger model below.'
                  : isCompare
                ? 'The same question and model, with and without retrieved repository code.'
                : results[0]?.mode === 'direct'
                  ? 'Answered without any repository code (RAG off).'
                  : 'Answer generated from retrieved repository code.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className={cn('grid gap-6', isCompare && 'lg:grid-cols-2')}>
              {results.map((result) => (
                <AnswerPanel
                  key={result.mode}
                  result={result}
                  showTitle={isCompare || result.mode === 'auto'}
                  onEscalate={result.mode === 'auto' && !escalated && !loading ? () => void escalate() : undefined}
                />
              ))}
            </div>

            {!loading && savable && (
              <div className="mt-5 flex justify-end">
                <Button size="sm" variant="outline" disabled={saveAnswer.isPending || saveAnswer.isSuccess} onClick={handleSaveAnswer}>
                  <Save /> {saveAnswer.isSuccess ? 'Saved' : saveAnswer.isPending ? 'Saving…' : escalated ? 'Save scaled-up answer' : isCompare ? 'Save RAG answer' : 'Save answer'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Ask about this codebase</CardTitle>
          <CardDescription>
            {active ? (
              <>
                Answering with <span className="font-medium text-foreground">{active.model}</span>{' '}
                ({active.location === 'cloud' ? `${active.label}, cloud` : 'local'}). Change the model in the top bar.
              </>
            ) : (
              'Questions are answered by the selected model.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit(question)
            }}
            className="space-y-3"
          >
            <div>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 sm:grid-cols-4" role="radiogroup" aria-label="Answer mode">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.value}
                    disabled={loading}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                      mode === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <m.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
            </div>

            <Textarea
              placeholder="e.g. Where is authentication handled?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              className="min-h-[96px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit(question)
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setQuestion(ex)
                    void submit(ex)
                  }}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={loading || !question.trim()} className="w-full">
              {loading ? <><Loader2 className="animate-spin" /> Thinking…</> : <><Sparkles /> Ask CodeMind</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

export default AskQuestionCard
