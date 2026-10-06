'use client'
import Link from 'next/link'
import { FolderGit2, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import useProject from '@/hooks/use-project'
import { EmptyState } from './empty-state'

type Project = NonNullable<ReturnType<typeof useProject>['project']>

/** Renders children only once a project is selected; otherwise guides the user. */
export function RequireProject({ children }: { children: (project: Project) => ReactNode }) {
  const { project, projects, isLoading } = useProject()

  if (isLoading || !projects) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!project) {
    return (
      <EmptyState
        icon={FolderGit2}
        title={projects.length === 0 ? 'No repositories yet' : 'Select a repository'}
        description={
          projects.length === 0
            ? 'Connect a GitHub repository and CodeMind will index it with a local AI model so you can search and ask questions about the code.'
            : 'Choose a repository from the sidebar to continue.'
        }
        action={
          <Button asChild>
            <Link href="/create"><Plus /> Connect repository</Link>
          </Button>
        }
      />
    )
  }

  return <>{children(project)}</>
}
