'use client'
import { AlertCircle, CheckCircle2, FileCode2, Folder, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CodeViewer, languageFor } from '@/components/codemind/code-viewer'
import { EmptyState } from '@/components/codemind/empty-state'
import { PageHeader } from '@/components/codemind/page-header'
import { RequireProject } from '@/components/codemind/require-project'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'

function FileDetail({ id }: { id: string }) {
  const { data, isLoading, error } = api.project.getFile.useQuery({ id })
  if (isLoading) return <Skeleton className="h-[60vh]" />
  if (error) return <p className="text-sm text-red-500">{error.message}</p>
  if (!data) return null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileCode2 className="size-4" />
        <span className="font-mono text-sm">{data.fileName}</span>
        <Badge variant="secondary">{languageFor(data.fileName)}</Badge>
        <span className="text-xs text-muted-foreground">{data.sourceCode.split('\n').length} lines</span>
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">AI summary (used for retrieval)</p>
        <p>{data.summary}</p>
      </div>
      <CodeViewer code={data.sourceCode} fileName={data.fileName} maxHeight="62vh" />
    </div>
  )
}

function FilesView({ projectId }: { projectId: string }) {
  const { data: files, isLoading } = api.project.getFiles.useQuery({ projectId })
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const visible = (files ?? []).filter((f) => !q || f.fileName.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q))
    const groups = new Map<string, typeof visible>()
    for (const file of visible) {
      const dir = file.fileName.includes('/') ? file.fileName.slice(0, file.fileName.lastIndexOf('/')) : '(root)'
      groups.set(dir, [...(groups.get(dir) ?? []), file])
    }
    return [...groups.entries()].sort(([a], [b]) => (a === '(root)' ? -1 : b === '(root)' ? 1 : a.localeCompare(b)))
  }, [files, filter])

  const embedded = files?.filter((f) => f.embedded).length ?? 0
  const activeId = selected ?? files?.[0]?.id ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository files"
        description="Files selected during indexing. Each one was summarised by the local LLM, and the summary was embedded for semantic retrieval."
        actions={files && (
          <Badge variant="outline" className="gap-1.5">
            {embedded === files.length ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertCircle className="size-3 text-amber-500" />}
            {embedded}/{files.length} embedded
          </Badge>
        )}
      />

      {isLoading && <Skeleton className="h-[60vh]" />}

      {files && files.length === 0 && (
        <EmptyState icon={FileCode2} title="No indexed files" description="This repository has no indexed files yet. Indexing happens when a repository is connected." />
      )}

      {files && files.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="max-h-[45vh] gap-3 py-4 lg:max-h-[78vh]">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">{files.length} files</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or summary" className="h-8 pl-8 text-sm" />
              </div>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto px-2">
              {grouped.length === 0 && <p className="px-2 text-sm text-muted-foreground">No matches.</p>}
              {grouped.map(([dir, dirFiles]) => (
                <div key={dir} className="mb-2">
                  <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
                    <Folder className="size-3.5" /> {dir}
                  </p>
                  {dirFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => {
                        setSelected(file.id)
                        // On phones the code panel sits below the list; bring it into view.
                        if (window.matchMedia('(max-width: 1023px)').matches) {
                          setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                        }
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                        activeId === file.id && 'bg-accent font-medium',
                      )}
                    >
                      <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs">{file.fileName.split('/').pop()}</span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{file.lines}L</span>
                      {!file.embedded && <span title="No embedding"><AlertCircle className="size-3 shrink-0 text-amber-500" /></span>}
                    </button>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card ref={detailRef} className="min-w-0 scroll-mt-16 py-4">
            <CardContent className="px-4">{activeId && <FileDetail id={activeId} />}</CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function FilesPage() {
  return <RequireProject>{(project) => <FilesView projectId={project.id} />}</RequireProject>
}
