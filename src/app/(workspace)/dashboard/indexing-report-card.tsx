'use client'
import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IndexingProgress } from '@/components/codemind/indexing-progress'
import { api } from '@/trpc/react'

export function IndexingReportCard({ projectId }: { projectId: string }) {
  const { data: job } = api.project.getLatestIndexingJob.useQuery({ projectId })
  const [showLog, setShowLog] = useState(false)
  if (!job) return null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><History className="size-4" /> Last indexing run</CardTitle>
          <CardDescription>{new Date(job.createdAt).toLocaleString()} · stage timings and counts recorded by the server</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowLog((v) => !v)}>
          {showLog ? <ChevronUp /> : <ChevronDown />} {showLog ? 'Hide' : 'Show'} activity log
        </Button>
      </CardHeader>
      <CardContent>
        <IndexingProgress job={job} compact={!showLog} />
      </CardContent>
    </Card>
  )
}
