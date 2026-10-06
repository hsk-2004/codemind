'use client'
import React, { useState } from 'react'
import { CodeViewer } from '@/components/codemind/code-viewer'
import { ScoreBar } from '@/components/codemind/score-bar'
import { cn } from '@/lib/utils'

type Props = {
  fileReferences: { filename: string; sourceCode: string; summary: string; similarity?: number }[]
}

const Codereferences = ({ fileReferences }: Props) => {
  const [active, setActive] = useState(0)
  if (!fileReferences || fileReferences.length === 0) return null
  const file = fileReferences[Math.min(active, fileReferences.length - 1)]!

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
      <ul className="space-y-1.5">
        {fileReferences.map((ref, i) => (
          <li key={`${ref.filename}-${i}`}>
            <button
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent',
                i === active && 'border-primary bg-accent',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                <span className="truncate font-mono text-xs">{ref.filename}</span>
              </div>
              {typeof ref.similarity === 'number' && <ScoreBar score={ref.similarity} className="mt-1.5" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 space-y-2">
        {file.summary && (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">AI summary: </span>{file.summary}
          </p>
        )}
        <CodeViewer code={file.sourceCode} fileName={file.filename} maxHeight="45vh" />
      </div>
    </div>
  )
}

export default Codereferences
