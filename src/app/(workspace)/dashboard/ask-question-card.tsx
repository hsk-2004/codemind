'use client'
import { Bot, Columns2, Loader2, MessageSquareText, MessageSquarePlus, ShieldCheck, ShieldOff, Sparkles, Square, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import useProject from '@/hooks/use-project'
import { useConversation } from '@/hooks/use-conversation'
import useRefetch from '@/hooks/use-refetch'
import type { AskMode, Turn } from '@/lib/conversation-storage'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'
import { ConversationDialog, savableResult } from './conversation-dialog'

const EXAMPLES = [
  'What does this project do?',
  'Where is the main entry point?',
  'How is data stored?',
  'Which files handle the UI?',
]

const MODES: { value: AskMode; label: string; hint: string; icon: typeof ShieldCheck }[] = [
  { value: 'rag', label: 'With RAG', hint: 'Retrieves relevant code first, then answers from it.', icon: ShieldCheck },
  { value: 'direct', label: 'Without RAG', hint: 'Asks the model with no repository code, as a baseline.', icon: ShieldOff },
  { value: 'auto', label: 'Auto-scale', hint: 'Answers on the small local model first, then offers to scale up to a larger cloud model. Nothing is sent to the cloud until you approve.', icon: TrendingUp },
  { value: 'compare', label: 'Compare both', hint: 'Runs both and shows the answers side by side.', icon: Columns2 },
]

const AskQuestionCard = () => {
  const { project } = useProject()
  const { data: models } = api.models.list.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false })
  const { turns, loading, ask, escalate, stop, reset } = useConversation(project?.id)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AskMode>('rag')
  const [question, setQuestion] = useState('')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const saveAnswer = api.project.saveAnswer.useMutation()
  const refetch = useRefetch()

  const submit = (text: string) => {
    const q = text.trim()
    if (!project?.id || !q || loading) return
    setOpen(true)
    setQuestion('')
    void ask(q, mode)
  }

  const save = (turn: Turn) => {
    const result = savableResult(turn)
    if (!project?.id || !result) return
    setSavingId(turn.id)
    saveAnswer.mutate(
      { projectId: project.id, question: turn.question, answer: result.output, filesReferences: result.filesReferences },
      {
        onSuccess: () => {
          setSavedIds((prev) => new Set(prev).add(turn.id))
          toast.success('Answer saved')
          void refetch()
        },
        onError: (e) => toast.error(e.message || 'Failed to save answer'),
        onSettled: () => setSavingId(null),
      },
    )
  }

  const active = models?.active

  return (
    <>
      <ConversationDialog
        open={open}
        onOpenChange={setOpen}
        turns={turns}
        loading={loading}
        onAsk={(text) => void ask(text, mode)}
        onStop={stop}
        onEscalate={(id) => void escalate(id)}
        onReset={() => {
          reset()
          setSavedIds(new Set())
        }}
        onSave={save}
        savedIds={savedIds}
        savingId={savingId}
      />

      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-fluid-lg"><Bot className="size-4" /> Ask about this codebase</CardTitle>
          <CardDescription className="text-fluid-sm">
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
              submit(question)
            }}
            className="space-y-fluid-sm"
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
                      'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-fluid-xs font-medium transition-colors',
                      mode === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <m.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-fluid-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
            </div>

            <Textarea
              placeholder="e.g. Where is authentication handled?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              className="min-h-24 resize-none text-fluid-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(question)
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={loading}
                  onClick={() => submit(ex)}
                  className="rounded-full border px-3 py-1 text-fluid-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {loading ? (
                <>
                  <Button type="button" className="flex-1" onClick={() => setOpen(true)}>
                    <Loader2 className="animate-spin" /> Answering… open the conversation
                  </Button>
                  <Button type="button" variant="destructive" onClick={stop}><Square /> Stop</Button>
                </>
              ) : (
                <Button type="submit" disabled={!question.trim()} className="min-w-40 flex-1">
                  <Sparkles /> Ask CodeMind
                </Button>
              )}
              {turns.length > 0 && !loading && (
                <>
                  <Button type="button" variant="outline" onClick={() => setOpen(true)}>
                    <MessageSquareText /> Conversation ({turns.length})
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { reset(); setSavedIds(new Set()) }}>
                    <MessageSquarePlus /> New chat
                  </Button>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}

export default AskQuestionCard
