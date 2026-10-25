'use client'
import { Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface Row {
  id: string
  question: string
  /** Expected file paths, separated by commas. */
  expected: string
}

export const newRow = (question = '', expected = ''): Row => ({ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), question, expected })

export const toQuestions = (rows: Row[]) =>
  rows
    .map((row) => ({ question: row.question.trim(), expectedFiles: row.expected.split(',').map((f) => f.trim()).filter(Boolean) }))
    .filter((q) => q.question.length >= 3 && q.expectedFiles.length > 0)

interface Props {
  rows: Row[]
  onChange: (rows: Row[]) => void
  onLoadSample: () => void
  onSuggest: () => void
  suggesting: boolean
  disabled?: boolean
}

/** The questions to test with, and the file that should come back for each one. */
export function QuestionEditor({ rows, onChange, onLoadSample, onSuggest, suggesting, disabled }: Props) {
  const update = (id: string, patch: Partial<Row>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  return (
    <div className="space-y-fluid-sm">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onLoadSample}>
          <Sparkles /> CodeMind sample questions
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || suggesting} onClick={onSuggest}>
          <Wand2 /> {suggesting ? 'Generating…' : 'Generate from this repository'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([...rows, newRow()])}>
          <Plus /> Add a question
        </Button>
        {rows.length > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([])}>
            <Trash2 /> Clear
          </Button>
        )}
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-fluid-md text-center text-fluid-sm text-muted-foreground">
          No questions yet. Load the sample, generate some from this repository, or add your own.
        </p>
      )}

      <ul className="space-y-fluid-xs">
        {rows.map((row, index) => (
          <li key={row.id} className="grid items-center gap-fluid-xs rounded-lg border bg-card p-fluid-xs sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
            <Input
              value={row.question}
              disabled={disabled}
              onChange={(e) => update(row.id, { question: e.target.value })}
              placeholder={`Question ${index + 1}, for example: Where is login handled?`}
              aria-label={`Question ${index + 1}`}
              className="text-fluid-sm"
            />
            <Input
              value={row.expected}
              disabled={disabled}
              onChange={(e) => update(row.id, { expected: e.target.value })}
              placeholder="Correct file, e.g. src/auth.ts"
              aria-label={`Expected file for question ${index + 1}`}
              className="font-mono text-fluid-xs"
            />
            <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Remove question ${index + 1}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
