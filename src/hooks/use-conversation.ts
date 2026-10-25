'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyEvent, pendingResult, stopResult, streamAsk } from '@/lib/ask-client'
import type { AnswerMode } from '@/lib/ask-types'
import { historyFor, newId, restoreTurns, serializeTurns, storageKey, type AskMode, type Turn } from '@/lib/conversation-storage'

/**
 * A chat with one repository: every question, its streamed answer, and the
 * memory that lets a follow-up such as "and where is it used?" make sense.
 * The conversation is kept in the browser, per repository, so it survives a refresh.
 */
export function useConversation(projectId: string | undefined) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns

  // Load this repository's conversation, and drop whatever was running for the previous one.
  useEffect(() => {
    abortRef.current?.abort()
    setLoading(false)
    let restored: Turn[] = []
    try {
      restored = projectId ? restoreTurns(localStorage.getItem(storageKey(projectId))) : []
    } catch {
      // Storage can be blocked (private mode); the chat then lasts until the page closes.
    }
    setTurns(restored)
    setHydratedFor(projectId ?? null)
  }, [projectId])

  // Save when nothing is being written, so half-finished answers are never stored.
  useEffect(() => {
    if (!projectId || hydratedFor !== projectId || loading) return
    try {
      if (turns.length === 0) localStorage.removeItem(storageKey(projectId))
      else localStorage.setItem(storageKey(projectId), serializeTurns(turns))
    } catch {
      // Out of space or blocked: keep working without saving.
    }
  }, [turns, loading, projectId, hydratedFor])

  const update = useCallback((turnId: string, mode: AnswerMode, change: (result: Turn['results'][number]) => Turn['results'][number]) => {
    setTurns((prev) => prev.map((turn) => (turn.id !== turnId ? turn : { ...turn, results: turn.results.map((r) => (r.mode === mode ? change(r) : r)) })))
  }, [])

  /** Streams one answer into its slot on screen. */
  const run = useCallback(
    async (turnId: string, question: string, mode: AnswerMode, history: ReturnType<typeof historyFor>, signal: AbortSignal) => {
      if (!projectId) return
      await streamAsk({ question, projectId, mode, history }, (event) => update(turnId, mode, (r) => applyEvent(r, event)), signal)
    },
    [projectId, update],
  )

  const ask = useCallback(
    async (question: string, mode: AskMode) => {
      const text = question.trim()
      if (!projectId || !text || loading) return
      const history = historyFor(turnsRef.current)
      const modes: AnswerMode[] = mode === 'compare' ? ['rag', 'direct'] : [mode]
      const turn: Turn = { id: newId(), question: text, mode, results: modes.map(pendingResult) }
      const controller = new AbortController()
      abortRef.current = controller
      setTurns((prev) => [...prev, turn])
      setLoading(true)
      try {
        // One after the other: a local GPU runs a single generation at a time.
        for (const answerMode of modes) {
          if (controller.signal.aborted) break
          await run(turn.id, text, answerMode, history, controller.signal)
        }
      } finally {
        setLoading(false)
      }
    },
    [projectId, loading, run],
  )

  /** Re-asks one turn on the larger cloud model, after the user approved it. */
  const escalate = useCallback(
    async (turnId: string) => {
      const index = turnsRef.current.findIndex((t) => t.id === turnId)
      const turn = turnsRef.current[index]
      if (!projectId || !turn || loading) return
      const history = historyFor(turnsRef.current.slice(0, index))
      const controller = new AbortController()
      abortRef.current = controller
      setTurns((prev) =>
        prev.map((t) => (t.id !== turnId ? t : { ...t, results: [...t.results.filter((r) => r.mode !== 'escalate'), pendingResult('escalate')] })),
      )
      setLoading(true)
      try {
        await run(turnId, turn.question, 'escalate', history, controller.signal)
      } finally {
        setLoading(false)
      }
    },
    [projectId, loading, run],
  )

  /** Stops the answer being written; the words so far stay on screen. */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    setTurns((prev) => prev.map((turn) => ({ ...turn, results: turn.results.map(stopResult) })))
    setLoading(false)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
    setTurns([])
  }, [])

  return { turns, loading, ask, escalate, stop, reset }
}
