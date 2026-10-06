'use client'
import MDEditor from '@uiw/react-md-editor'
import { FileCode2, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/codemind/empty-state'
import { PageHeader } from '@/components/codemind/page-header'
import { RequireProject } from '@/components/codemind/require-project'
import { api } from '@/trpc/react'
import AskQuestionCard from '../dashboard/ask-question-card'
import Codereferences from '../dashboard/code-references'

type StoredReference = { fileName?: string; filename?: string; sourceCode?: string; summary?: string; similarity?: number }

function toReferences(value: unknown) {
  if (!Array.isArray(value)) return []
  return (value as StoredReference[]).map((f) => ({
    filename: f.fileName ?? f.filename ?? 'unknown',
    sourceCode: f.sourceCode ?? '',
    summary: f.summary ?? '',
    similarity: typeof f.similarity === 'number' ? f.similarity : undefined,
  }))
}

function QAView({ projectId }: { projectId: string }) {
  const { data: questions, isLoading } = api.project.getQuestions.useQuery({ projectId })
  const [openId, setOpenId] = useState<string | null>(null)
  const selected = questions?.find((q) => q.id === openId)
  const selectedRefs = selected ? toReferences(selected.filesReferences) : []

  return (
    <div className="space-y-6">
      <PageHeader title="Ask AI" description="Ask questions about the repository. Answers are generated locally from retrieved code, and you can save useful ones for your team." />

      <AskQuestionCard />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-4" /> Saved answers
          {questions && <Badge variant="secondary">{questions.length}</Badge>}
        </h2>

        {isLoading && <Skeleton className="h-40" />}
        {questions && questions.length === 0 && (
          <EmptyState icon={MessageSquareText} title="No saved answers yet" description='Ask a question above and click "Save answer" to keep it here for your team.' />
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {questions?.map((q) => {
            const refs = toReferences(q.filesReferences)
            return (
              <Card key={q.id} className="cursor-pointer gap-0 py-0 transition-colors hover:bg-accent/40" onClick={() => setOpenId(q.id)}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    {q.user.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.user.imageUrl} alt="" className="size-6 rounded-full" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {q.user.firstName ?? q.user.emailAddress} · {new Date(q.createdAt).toLocaleDateString()}
                    </span>
                    {refs.length > 0 && (
                      <Badge variant="outline" className="ml-auto gap-1"><FileCode2 className="size-3" />{refs.length}</Badge>
                    )}
                  </div>
                  <p className="line-clamp-1 font-medium">{q.question}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{q.answer}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-[80vw]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-left">{selected.question}</SheetTitle>
                <SheetDescription className="text-left">
                  Saved by {selected.user.firstName ?? selected.user.emailAddress} on {new Date(selected.createdAt).toLocaleString()}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
                <div className="rounded-lg border p-4" data-color-mode="dark">
                  <MDEditor.Markdown source={selected.answer} style={{ background: 'transparent', fontSize: 14 }} />
                </div>
                {selectedRefs.length > 0 ? (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileCode2 className="size-4" /> Sources ({selectedRefs.length})</h3>
                    <Codereferences fileReferences={selectedRefs} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This answer has no source files attached.</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function QAPage() {
  return <RequireProject>{(project) => <QAView projectId={project.id} />}</RequireProject>
}
