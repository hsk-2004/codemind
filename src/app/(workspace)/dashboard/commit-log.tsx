'use client'

import Link from 'next/link'
import { AlertTriangle, ExternalLink, GitCommitHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/codemind/empty-state'
import useProject from '@/hooks/use-project'
import { parseComponents } from '@/lib/parse-components'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'

const severityClass: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/15 text-red-400',
  high: 'border-orange-500/40 bg-orange-500/15 text-orange-400',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  low: 'border-sky-500/40 bg-sky-500/15 text-sky-400',
}

export function SeverityBadge({ severity }: { severity: string | null }) {
  const key = severity ?? 'unknown'
  return (
    <Badge variant="outline" className={cn('capitalize', severityClass[key])}>
      {key}
    </Badge>
  )
}

const CommitLog = () => {
  const { projectId, project } = useProject()
  const { data: commits, isLoading } = api.project.getCommits.useQuery({ projectId })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><GitCommitHorizontal className="size-4" /> Commit history</CardTitle>
        <CardDescription>Each commit is summarised from its diff and checked for breaking changes by the local model.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        )}
        {commits && commits.length === 0 && (
          <EmptyState icon={GitCommitHorizontal} title="No commits analysed yet" description='Use "Fetch new commits" to analyse the latest commits from GitHub.' />
        )}
        {commits && commits.length > 0 && (
          <ol className="relative space-y-4 border-l pl-6">
            {commits.map((commit) => {
              const components = parseComponents(commit.affectedComponents)
              return (
                <li key={commit.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[31px] top-4 size-3 rounded-full border-2 border-background',
                      commit.hasBreakingChanges ? 'bg-red-500' : 'bg-muted-foreground',
                    )}
                  />
                  <div className={cn('rounded-lg border p-4', commit.hasBreakingChanges && 'border-red-500/40 bg-red-500/5')}>
                    <div className="flex flex-wrap items-center gap-2">
                      {commit.commitAuthorAvatar.trim() && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={commit.commitAuthorAvatar} alt="" className="size-6 rounded-full" />
                      )}
                      <span className="text-sm font-medium">{commit.commitAuthorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(commit.commitDate).toLocaleString()}
                      </span>
                      <Link
                        target="_blank"
                        href={`${project?.githubUrl}/commit/${commit.commitHash}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {commit.commitHash.slice(0, 7)} <ExternalLink className="size-3" />
                      </Link>
                      {commit.hasBreakingChanges && (
                        <div className="ml-auto flex items-center gap-2">
                          <AlertTriangle className="size-4 text-red-500" />
                          <SeverityBadge severity={commit.breakingChangeSeverity} />
                          {commit.migrationRequired && <Badge variant="outline">Migration required</Badge>}
                        </div>
                      )}
                    </div>

                    <p className="mt-2 font-medium">{commit.commitMessage.split('\n')[0]}</p>
                    {commit.summary.trim() && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{commit.summary}</p>
                    )}

                    {commit.hasBreakingChanges && (commit.breakingChangeDetails || components.length > 0 || commit.migrationSteps) && (
                      <div className="mt-3 space-y-2 rounded-md border border-red-500/30 bg-background/50 p-3 text-sm">
                        {commit.breakingChangeDetails && <p>{commit.breakingChangeDetails}</p>}
                        {components.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-xs text-muted-foreground">Affected:</span>
                            {components.map((c) => <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>)}
                          </div>
                        )}
                        {commit.migrationSteps && (
                          <details>
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Migration steps</summary>
                            <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{commit.migrationSteps}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export default CommitLog
