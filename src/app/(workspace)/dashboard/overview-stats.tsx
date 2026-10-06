'use client'
import { AlertTriangle, Brain, FileCode2, GitCommitHorizontal, MessageSquareText } from 'lucide-react'
import { StatCard } from '@/components/codemind/stat-card'
import { api } from '@/trpc/react'

export function OverviewStats({ projectId }: { projectId: string }) {
  const { data } = api.project.getOverview.useQuery({ projectId })

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Indexed files" value={data?.indexedFiles} icon={FileCode2} hint="Summarised by the LLM" />
      <StatCard
        label="Embedded"
        value={data ? `${data.embeddedFiles}/${data.indexedFiles}` : undefined}
        icon={Brain}
        hint="Searchable vectors"
        tone={data && data.embeddedFiles === data.indexedFiles && data.indexedFiles > 0 ? 'success' : 'default'}
      />
      <StatCard
        label="Commits analysed"
        value={data?.commits}
        icon={GitCommitHorizontal}
        hint={data?.latestCommitAt ? `Latest ${new Date(data.latestCommitAt).toLocaleDateString()}` : undefined}
      />
      <StatCard
        label="Breaking changes"
        value={data?.breakingChanges}
        icon={AlertTriangle}
        tone={data && data.breakingChanges > 0 ? 'warning' : 'success'}
        hint={data && data.commits > 0 ? `${((data.breakingChanges / data.commits) * 100).toFixed(0)}% of commits` : undefined}
      />
      <StatCard label="Saved answers" value={data?.savedQuestions} icon={MessageSquareText} />
    </div>
  )
}
