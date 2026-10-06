'use client'
import { ChevronDown, ChevronRight, Loader2, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CodeViewer } from '@/components/codemind/code-viewer'
import { EmptyState } from '@/components/codemind/empty-state'
import { PageHeader } from '@/components/codemind/page-header'
import { RequireProject } from '@/components/codemind/require-project'
import { ScoreBar } from '@/components/codemind/score-bar'
import { api } from '@/trpc/react'

const SUGGESTIONS = ['authentication', 'database connection', 'API routes', 'state management', 'configuration', 'error handling']

function SearchView({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const search = api.project.search.useMutation()

  const run = (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) return
    setLastQuery(trimmed)
    setExpanded(null)
    search.mutate({ projectId, query: trimmed, limit: 10 })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Semantic search"
        description="Find code by meaning, not keywords. Your query is embedded with nomic-embed-text and compared against every indexed file using cosine similarity in pgvector. No LLM is involved, so results are instant."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(query)
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. where are users stored?"
            className="h-11 pl-9"
          />
        </div>
        <Button type="submit" className="h-11" disabled={search.isPending || query.trim().length < 2}>
          {search.isPending ? <Loader2 className="animate-spin" /> : <Search />} Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuery(s)
              run(s)
            }}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      {search.error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-400">{search.error.message}</div>
      )}

      {search.data && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {search.data.results.length} result{search.data.results.length === 1 ? '' : 's'} for <span className="font-medium text-foreground">“{lastQuery}”</span> in {search.data.latencyMs}ms
          </p>

          {search.data.results.length === 0 ? (
            <EmptyState icon={SearchX} title="No relevant files" description="Nothing in the indexed files is semantically close to this query. Try rephrasing, or check that the repository finished indexing." />
          ) : (
            search.data.results.map((r, i) => {
              const isOpen = expanded === r.fileName
              return (
                <Card key={r.fileName} className="gap-0 py-0">
                  <CardContent className="p-0">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : r.fileName)}
                      className="flex w-full items-start gap-3 p-4 text-left hover:bg-accent/40"
                    >
                      {isOpen ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="tabular-nums">#{i + 1}</Badge>
                          <span className="truncate font-mono text-sm">{r.fileName}</span>
                          <span className="text-xs text-muted-foreground">{r.lines} lines</span>
                          <ScoreBar score={r.score} className="ml-auto" />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{r.summary}</p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t p-4">
                        <CodeViewer code={r.preview} fileName={r.fileName} maxHeight="50vh" />
                        {r.preview.length >= 2000 && <p className="mt-2 text-xs text-muted-foreground">Preview truncated. Open Repository Files for the full source.</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {!search.data && !search.isPending && !search.error && (
        <EmptyState icon={Search} title="Search the codebase by meaning" description='Describe what you are looking for in plain English, for example "where is the login logic" or "how are payments processed".' />
      )}
    </div>
  )
}

export default function SearchPage() {
  return <RequireProject>{(project) => <SearchView projectId={project.id} />}</RequireProject>
}
