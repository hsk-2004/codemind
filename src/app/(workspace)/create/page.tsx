'use client'

import { useRouter } from 'next/navigation'
import { Brain, Database, Eye, FileCode2, GitBranch, GitCommitHorizontal, Github, Loader2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IndexingProgress } from '@/components/codemind/indexing-progress'
import { PageHeader } from '@/components/codemind/page-header'
import useProject from '@/hooks/use-project'
import useRefetch from '@/hooks/use-refetch'
import { api } from '@/trpc/react'

type FormInput = {
  repoUrl: string
  projectName: string
  githubToken?: string
}

const STEPS = [
  { icon: Github, title: 'Load repository', text: 'Files are fetched from the default branch through the GitHub API. Nothing is executed.' },
  { icon: FileCode2, title: 'Select files', text: 'Source files are prioritised; lockfiles, build output and files over 50 KB are skipped.' },
  { icon: Brain, title: 'Summarise', text: 'qwen2.5-coder writes a short summary of each file, running locally through Ollama.' },
  { icon: Database, title: 'Embed and store', text: 'nomic-embed-text turns each summary into a 768-dimensional vector stored in pgvector.' },
  { icon: GitCommitHorizontal, title: 'Analyse commits', text: 'Recent commits are summarised and checked for breaking changes.' },
]

export default function CreatePage() {
  const router = useRouter()
  const refetch = useRefetch()
  const { setProjectId } = useProject()
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormInput>()
  const repoUrl = watch('repoUrl')
  const githubToken = watch('githubToken')

  const previewIndex = api.project.previewIndex.useMutation()
  const createProject = api.project.createProject.useMutation()

  const [jobId, setJobId] = useState<string | null>(null)
  const job = api.project.getIndexingJob.useQuery(
    { jobId: jobId ?? '' },
    {
      enabled: !!jobId,
      refetchInterval: (query) => (query.state.data?.status && query.state.data.status !== 'running' ? false : 1000),
    },
  )

  function onSubmit(data: FormInput) {
    const id = crypto.randomUUID().replace(/-/g, '')
    setJobId(id)
    createProject.mutate(
      { githubUrl: data.repoUrl.trim(), name: data.projectName.trim(), githubToken: data.githubToken?.trim() || undefined, jobId: id },
      {
        onSuccess: async (project) => {
          toast.success('Repository indexed')
          setProjectId(project.id)
          await job.refetch()
          await refetch()
          setTimeout(() => router.push('/dashboard'), 2500)
        },
        onError: async (error) => {
          toast.error(error.message || 'Failed to connect repository')
          await job.refetch()
        },
      },
    )
  }

  const busy = createProject.isPending

  return (
    <div className="space-y-6">
      <PageHeader title="Connect a repository" description="CodeMind indexes a GitHub repository with local AI models so you can search it and ask questions about the code." />

      {jobId && job.data && (
        <Card>
          <CardHeader>
            <CardTitle>Live indexing progress</CardTitle>
            <CardDescription>Streamed from the server as each stage runs. Keep this tab open until it finishes.</CardDescription>
          </CardHeader>
          <CardContent>
            <IndexingProgress job={job.data} />
            {job.data.status === 'completed' && (
              <p className="mt-4 text-sm text-muted-foreground">Opening the dashboard…</p>
            )}
          </CardContent>
        </Card>
      )}
      {jobId && !job.data && busy && (
        <Card><CardContent className="flex items-center gap-3 py-6 text-sm"><Loader2 className="size-4 animate-spin" /> Starting indexing job…</CardContent></Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GitBranch className="size-4" /> Repository details</CardTitle>
            <CardDescription>Public repositories work without a token. Private repositories need a token with read access.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="projectName">Project name</Label>
                <Input id="projectName" disabled={busy} placeholder="My project" {...register('projectName', { required: 'Project name is required' })} />
                {errors.projectName && <p className="text-xs text-red-500">{errors.projectName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repoUrl">GitHub URL</Label>
                <Input
                  id="repoUrl"
                  disabled={busy}
                  placeholder="https://github.com/owner/repository"
                  {...register('repoUrl', {
                    required: 'Repository URL is required',
                    pattern: { value: /^(https?:\/\/)?(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/, message: 'Enter a URL like https://github.com/owner/repo' },
                  })}
                />
                {errors.repoUrl && <p className="text-xs text-red-500">{errors.repoUrl.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="githubToken">GitHub token <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="githubToken" type="password" disabled={busy} placeholder="ghp_…" autoComplete="off" {...register('githubToken')} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || previewIndex.isPending || !repoUrl}
                  onClick={() => previewIndex.mutate({ githubUrl: repoUrl.trim(), githubToken: githubToken?.trim() || undefined, maxFiles: 30 })}
                >
                  {previewIndex.isPending ? <Loader2 className="animate-spin" /> : <Eye />} Preview files
                </Button>
                <Button type="submit" disabled={busy} className="flex-1">
                  {busy ? <><Loader2 className="animate-spin" /> Indexing…</> : 'Connect and index'}
                </Button>
              </div>
            </form>

            {previewIndex.error && <p className="mt-4 text-sm text-red-500">{previewIndex.error.message}</p>}
            {previewIndex.data && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium">
                  {previewIndex.data.selectedFiles.length} of {previewIndex.data.totalFiles} files will be indexed
                </p>
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {previewIndex.data.selectedFiles.map((f) => (
                    <li key={f.path} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-accent">
                      <span className="flex min-w-0 items-center gap-2"><FileCode2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate font-mono">{f.path}</span></span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What happens next</CardTitle>
            <CardDescription>The indexing pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted">
                    <step.icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{i + 1}. {step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
