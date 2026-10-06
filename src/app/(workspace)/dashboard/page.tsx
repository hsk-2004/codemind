'use client'
import Link from 'next/link'
import { ExternalLink, Github, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RequireProject } from '@/components/codemind/require-project'
import { api } from '@/trpc/react'
import ArchiveButton from './archive-button'
import AskQuestionCard from './ask-question-card'
import BreakingChangesAlert from './breaking-changes-alert'
import BreakingChangesMonitorSimple from './breaking-changes-monitor-simple'
import CommitLog from './commit-log'
import { IndexingReportCard } from './indexing-report-card'
import { OverviewStats } from './overview-stats'
import { RepoInsightsCard } from './repo-insights-card'
import { SystemMiniCard } from './system-mini-card'

function FetchCommitsButton({ projectId }: { projectId: string }) {
  const utils = api.useUtils()
  const poll = api.project.pollNewCommits.useMutation({
    onSuccess: async () => {
      toast.success('Commits analysed')
      await Promise.all([utils.project.getCommits.invalidate(), utils.project.getOverview.invalidate()])
    },
    onError: (e) => toast.error(e.message || 'Failed to fetch commits'),
  })
  return (
    <Button size="sm" onClick={() => poll.mutate({ projectId })} disabled={poll.isPending}>
      {poll.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {poll.isPending ? 'Analysing commits…' : 'Fetch new commits'}
    </Button>
  )
}

export default function DashboardPage() {
  return (
    <RequireProject>
      {(project) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
              <Link
                href={project.githubUrl}
                target="_blank"
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Github className="size-4" />
                {project.githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ArchiveButton />
              <FetchCommitsButton projectId={project.id} />
            </div>
          </div>

          <OverviewStats projectId={project.id} />

          <BreakingChangesAlert />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AskQuestionCard />
            </div>
            <SystemMiniCard />
          </div>

          <RepoInsightsCard projectId={project.id} />

          <IndexingReportCard projectId={project.id} />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Breaking-change monitor</h2>
            <BreakingChangesMonitorSimple />
          </section>

          <CommitLog />
        </div>
      )}
    </RequireProject>
  )
}
