'use client'
import { ArrowDown, MessageSquarePlus, Save, SendHorizontal, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnswerPanel } from '@/components/codemind/answer-panel'
import { InfoTip } from '@/components/codemind/info-tip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { AskResult } from '@/lib/ask-client'
import type { Turn } from '@/lib/conversation-storage'
import { MAX_HISTORY_TURNS } from '@/services/rag/history'
import { cn } from '@/lib/utils'

const FOLLOW_UPS = ['Explain that in simpler terms', 'Show a short example', 'Where is this used?', 'What could break if I change it?']

/** The grounded answer of a turn, which is the one worth saving. */
export function savableResult(turn: Turn): AskResult | undefined {
  return (
    turn.results.find((r) => r.mode === 'escalate' && r.status === 'done') ??
    turn.results.find((r) => (r.mode === 'rag' || r.mode === 'auto') && r.status === 'done') ??
    turn.results.find((r) => r.status === 'done')
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  turns: Turn[]
  loading: boolean
  onAsk: (question: string) => void
  onStop: () => void
  onEscalate: (turnId: string) => void
  onReset: () => void
  onSave: (turn: Turn) => void
  savedIds: Set<string>
  savingId: string | null
}

export function ConversationDialog({ open, onOpenChange, turns, loading, onAsk, onStop, onEscalate, onReset, onSave, savedIds, savingId }: Props) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  // Follow the answer as it is written, unless the reader scrolled up to read earlier text.
  const stick = useRef(true)
  const [away, setAway] = useState(false)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stick.current = nearBottom
    setAway(!nearBottom)
  }, [])

  const lastText = turns[turns.length - 1]?.results.map((r) => r.output.length + r.filesReferences.length).join('-')
  useEffect(() => {
    if (open && stick.current) endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, lastText, open])

  const send = (text: string) => {
    const question = text.trim()
    if (!question || loading) return
    stick.current = true
    setDraft('')
    onAsk(question)
  }

  const first = turns[0]?.question

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(92dvh,56rem)] w-[min(96vw,76rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,76rem)]"
        // Land in the follow-up box, not on the first button, so no help tooltip pops open by itself.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          composerRef.current?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader className="shrink-0 border-b p-fluid-md pr-12">
          <DialogTitle className="line-clamp-2 text-left text-fluid-lg">{first ?? 'Conversation'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left text-fluid-xs">
            <span>
              {turns.length} question{turns.length === 1 ? '' : 's'}. Sources appear first, then the answer is written live.
            </span>
            <span className="inline-flex items-center gap-1">
              Follow-ups remember your last {MAX_HISTORY_TURNS} questions
              <InfoTip>
                When you ask something like &ldquo;and where is it used?&rdquo;, CodeMind searches the repository using your previous question as well, and tells the model what &ldquo;it&rdquo; refers to. Start a new chat to forget everything.
              </InfoTip>
            </span>
            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={onReset} disabled={turns.length === 0}>
              <MessageSquarePlus /> New chat
            </Button>
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 space-y-fluid-lg overflow-y-auto p-fluid-md">
          {turns.map((turn, index) => {
            const savable = savableResult(turn)
            const compare = turn.results.length > 1
            const last = index === turns.length - 1
            return (
              <article key={turn.id} className="space-y-fluid-md">
                <div className="flex justify-end">
                  <p className="max-w-[min(100%,44rem)] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-fluid-md py-fluid-sm text-fluid-sm text-primary-foreground">{turn.question}</p>
                </div>
                <div className={cn('grid gap-fluid-lg', compare && 'lg:grid-cols-2')}>
                  {turn.results.map((result) => (
                    <AnswerPanel
                      key={result.mode}
                      result={result}
                      showTitle={compare || result.mode === 'auto' || result.mode === 'escalate'}
                      onEscalate={result.mode === 'auto' && last && !loading && !turn.results.some((r) => r.mode === 'escalate') ? () => onEscalate(turn.id) : undefined}
                      onStop={last ? onStop : undefined}
                    />
                  ))}
                </div>
                {savable && !loading && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={savedIds.has(turn.id) || savingId === turn.id} onClick={() => onSave(turn)}>
                      <Save /> {savedIds.has(turn.id) ? 'Saved' : savingId === turn.id ? 'Saving…' : 'Save answer'}
                    </Button>
                  </div>
                )}
              </article>
            )
          })}
          <div ref={endRef} />
          {away && (
            <Button
              size="sm"
              variant="secondary"
              className="sticky bottom-0 left-full -translate-x-1 rounded-full shadow-md"
              onClick={() => {
                stick.current = true
                endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
              }}
            >
              <ArrowDown /> Latest
            </Button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
          className="shrink-0 space-y-fluid-sm border-t bg-background p-fluid-sm"
        >
          <div className="flex gap-fluid-xs overflow-x-auto pb-0.5" aria-label="Suggested follow-ups">
            {FOLLOW_UPS.map((text) => (
              <button
                key={text}
                type="button"
                disabled={loading}
                onClick={() => send(text)}
                className="shrink-0 rounded-full border px-3 py-1 text-fluid-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-fluid-xs">
            <Textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a follow-up question…"
              rows={1}
              disabled={loading}
              className="max-h-36 min-h-10 flex-1 resize-none text-fluid-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            {loading ? (
              <Button type="button" variant="destructive" onClick={onStop}>
                <Square /> <span className="hidden sm:inline">Stop</span>
              </Button>
            ) : (
              <Button type="submit" disabled={!draft.trim()}>
                <SendHorizontal /> <span className="hidden sm:inline">Send</span>
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
