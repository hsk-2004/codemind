'use client'
import { useCallback, useRef, useState } from 'react'
import type { ExplainEvent } from '@/lib/ask-types'
import { applyExplainEvent, pendingExplain, type ExplainState } from '@/lib/explain-client'
import { streamEvents } from '@/lib/stream-client'

/**
 * Explains files one at a time and remembers every explanation for as long as the
 * page is open, so going back to a file you already explained is instant.
 */
export function useExplain() {
  const [states, setStates] = useState<Record<string, ExplainState>>({})
  const controllers = useRef(new Map<string, AbortController>())

  const start = useCallback(async (fileId: string) => {
    controllers.current.get(fileId)?.abort()
    const controller = new AbortController()
    controllers.current.set(fileId, controller)
    setStates((prev) => ({ ...prev, [fileId]: pendingExplain() }))
    await streamEvents<ExplainEvent>(
      '/api/explain',
      { fileId },
      (event) => setStates((prev) => (prev[fileId] ? { ...prev, [fileId]: applyExplainEvent(prev[fileId], event) } : prev)),
      controller.signal,
    )
  }, [])

  const stop = useCallback((fileId: string) => {
    controllers.current.get(fileId)?.abort()
    setStates((prev) => {
      const state = prev[fileId]
      return state && (state.status === 'loading' || state.status === 'streaming') ? { ...prev, [fileId]: { ...state, status: 'stopped' } } : prev
    })
  }, [])

  return { states, start, stop }
}
