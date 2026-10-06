'use client'
import { Boxes, CheckCircle2, Container, FlaskConical, Lightbulb, Package, Workflow, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/trpc/react'

const LANGUAGE_COLORS = ['bg-sky-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-teal-500']

function DetectionRow({ icon, label, detected, children }: { icon: ReactNode; label: string; detected: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          {detected ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="size-3.5" /> Detected</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="size-3.5" /> Not found</span>
          )}
        </div>
        {children && <div className="mt-1.5 flex flex-wrap gap-1">{children}</div>}
      </div>
    </div>
  )
}

const FileChip = ({ path }: { path: string }) => (
  <Badge variant="secondary" className="max-w-full truncate font-mono text-[11px]">{path}</Badge>
)

export function RepoInsightsCard({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = api.project.getInsights.useQuery(
    { projectId },
    { staleTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false },
  )

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Boxes className="size-4" /> Languages</CardTitle>
          <CardDescription>
            {data ? `${data.totalFiles} files on ${data.defaultBranch}${data.truncated ? ' (GitHub truncated the tree)' : ''}` : 'From the full repository tree on GitHub'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-32" />}
          {error && <p className="text-sm text-red-500">{error.message}</p>}
          {data && data.languages.length === 0 && <p className="text-sm text-muted-foreground">No source files recognised.</p>}
          {data && data.languages.length > 0 && (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {data.languages.slice(0, 6).map((l, i) => (
                  <div key={l.language} className={LANGUAGE_COLORS[i]} style={{ width: `${l.percent}%` }} title={`${l.language} ${l.percent}%`} />
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {data.languages.slice(0, 6).map((l, i) => (
                  <li key={l.language} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${LANGUAGE_COLORS[i]}`} />
                      {l.language}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{l.files} files · {l.percent}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Workflow className="size-4" /> DevOps detection</CardTitle>
          <CardDescription>Detected automatically from the repository structure. No repository code is executed.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-40" />}
          {data && (
            <div className="space-y-2">
              <DetectionRow icon={<Container className="size-4" />} label="Docker" detected={data.docker.dockerfiles.length > 0}>
                {[...data.docker.dockerfiles, ...data.docker.compose].slice(0, 4).map((f) => <FileChip key={f} path={f} />)}
              </DetectionRow>
              <DetectionRow icon={<Workflow className="size-4" />} label="CI/CD" detected={data.ci.length > 0}>
                {data.ci.map((c) => <Badge key={c.name} variant="outline">{c.name} · {c.files.length}</Badge>)}
              </DetectionRow>
              <DetectionRow icon={<Package className="size-4" />} label="Dependencies" detected={data.dependencies.length > 0}>
                {data.dependencies.map((d) => <Badge key={d.name} variant="outline">{d.name}</Badge>)}
              </DetectionRow>
              <DetectionRow
                icon={<FlaskConical className="size-4" />}
                label="Tests"
                detected={data.tests.testFiles > 0 || data.tests.frameworks.length > 0}
              >
                {data.tests.frameworks.map((f) => <Badge key={f.name} variant="outline">{f.name}</Badge>)}
                {data.tests.testFiles > 0 && <Badge variant="secondary">{data.tests.testFiles} test files</Badge>}
              </DetectionRow>
              {data.suggestions.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-500"><Lightbulb className="size-4" /> Suggestions</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    {data.suggestions.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
