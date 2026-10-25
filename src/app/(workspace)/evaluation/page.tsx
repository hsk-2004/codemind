'use client'
import { FlaskConical, Loader2, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocalStorage } from 'usehooks-ts'
import { Explainer } from '@/components/codemind/explainer'
import { PageHeader } from '@/components/codemind/page-header'
import { RequireProject } from '@/components/codemind/require-project'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/trpc/react'
import { QuestionEditor, newRow, toQuestions, type Row } from './question-editor'
import { EvalResults, type EvalReport } from './results'

interface Saved {
  rows: Row[]
  report: EvalReport | null
}

function LabView({ projectId }: { projectId: string }) {
  // Kept in the browser per repository, so the table is still there after a refresh.
  const [saved, setSaved] = useLocalStorage<Saved>(`codemind-eval:${projectId}`, { rows: [], report: null }, { initializeWithValue: false })
  const [rows, setRows] = useState<Row[]>(saved.rows)
  const [report, setReport] = useState<EvalReport | null>(saved.report)
  const [k, setK] = useState('6')

  useEffect(() => {
    setRows(saved.rows)
    setReport(saved.report)
    // Only when the repository (and so the saved data) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
  useEffect(() => setSaved({ rows, report }), [rows, report, setSaved])

  const sample = api.evaluation.sample.useQuery(undefined, { staleTime: Infinity, refetchOnWindowFocus: false })
  const suggest = api.evaluation.suggest.useMutation({
    onSuccess: (questions) => {
      if (questions.length === 0) return toast.error('Not enough indexed code to write questions from.')
      setRows(questions.map((q) => newRow(q.question, q.expectedFiles.join(', '))))
      setReport(null)
      toast.success(`${questions.length} questions generated`)
    },
    onError: (e) => toast.error(e.message),
  })
  const run = api.evaluation.run.useMutation({
    onSuccess: (result) => setReport(result),
    onError: (e) => toast.error(e.message),
  })

  const questions = toQuestions(rows)
  const incomplete = rows.length - questions.length

  return (
    <div className="space-y-fluid-lg">
      <PageHeader
        title="Retrieval lab"
        description="Measure, with numbers, how well CodeMind finds the right code, and see what hybrid search adds."
      />

      <Explainer
        id="evaluation"
        steps={[
          { title: 'Write questions with answers', text: 'Each question comes with the file that should be found. That is the answer key.' },
          { title: 'Run both searches', text: 'Vector search matches meaning. Hybrid also matches exact words such as function names, then merges both lists.' },
          { title: 'Compare the scores', text: 'Hit rate asks "was the right file found?". MRR asks "how near the top?". Higher is better.' },
        ]}
        note="Ten questions is a small test. Treat the result as evidence, not proof, and add more questions about your own repository."
      />

      <Card>
        <CardContent className="space-y-fluid-md">
          <div>
            <h2 className="mb-fluid-xs text-fluid-base font-semibold">1. Questions and their correct files</h2>
            <QuestionEditor
              rows={rows}
              onChange={(next) => {
                setRows(next)
                setReport(null)
              }}
              onLoadSample={() => {
                setRows((sample.data ?? []).map((q) => newRow(q.question, q.expectedFiles.join(', '))))
                setReport(null)
              }}
              onSuggest={() => suggest.mutate({ projectId, count: 10 })}
              suggesting={suggest.isPending}
              disabled={run.isPending}
            />
            <p className="mt-fluid-xs text-fluid-xs text-muted-foreground">
              The sample questions are about CodeMind&apos;s own source, so they only make sense on the CodeMind repository. For any other repository, generate questions or write your own.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-fluid-md">
            <div className="space-y-1">
              <label htmlFor="top-k" className="text-fluid-xs font-medium">2. Files returned per question (top K)</label>
              <Select value={k} onValueChange={setK} disabled={run.isPending}>
                <SelectTrigger id="top-k" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 6, 8, 10].map((n) => <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={questions.length === 0 || run.isPending}
              onClick={() => run.mutate({ projectId, k: Number(k), questions })}
              className="w-full sm:w-auto"
            >
              {run.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              {run.isPending ? 'Running both searches…' : `Run on ${questions.length} question${questions.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          {incomplete > 0 && <p className="text-fluid-xs text-amber-500">{incomplete} row{incomplete === 1 ? ' is' : 's are'} missing a question or a correct file and will be skipped.</p>}
        </CardContent>
      </Card>

      {report && <EvalResults report={report} />}

      {!report && !run.isPending && (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-fluid-lg text-center text-muted-foreground">
          <FlaskConical className="mb-2 size-6" />
          <p className="text-fluid-sm">The scores and charts will appear here after you run the test.</p>
        </div>
      )}
    </div>
  )
}

export default function EvaluationPage() {
  return <RequireProject>{(project) => <LabView projectId={project.id} />}</RequireProject>
}
