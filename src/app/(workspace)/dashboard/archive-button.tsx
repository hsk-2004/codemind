'use client'
import { Button } from '@/components/ui/button'
import useProject from '@/hooks/use-project'
import useRefetch from '@/hooks/use-refetch'
import { api } from '@/trpc/react'
import { useRouter } from 'next/navigation'
import React from 'react'
import { toast } from 'sonner'
import { Archive } from 'lucide-react'

const ArchiveButton = () => {
  const utils = api.useUtils() // gives cache helpers for optimistic updates
  const { projectId } = useProject()
  const refetch = useRefetch()
  const router = useRouter()

  const archiveProject = api.project.archiveProject.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await utils.project.getProjects.cancel()
      // Snapshot the current projects
      const prevData = utils.project.getProjects.getData()
      // Optimistically remove the project from UI
      utils.project.getProjects.setData(undefined, old => {
        if (!old) return old
        return old.filter(p => p.id !== variables.projectId)
      })
      return { prevData }
    },
    onError: (err, variables, context) => {
      // Rollback if error
      utils.project.getProjects.setData(undefined, context?.prevData)
      toast.error("Failed to archive project")
    },
    onSuccess: () => {
      toast.success("Project Archived")
      // Reload the page after successful archive
      setTimeout(() => {
        window.location.reload()
      }, 300) // Small delay to show the success toast
    },
    onSettled: () => {
      // Ensure final refetch to stay in sync
      refetch()
    }
  })

  return (
    <Button size={'sm'}
      variant='outline'
      disabled={archiveProject.isPending}
      onClick={() => {
        const confirm = window.confirm("Are you sure you want to archive this project?")
        if (confirm) {
          archiveProject.mutate({ projectId })
        }
      }}
    >
      <Archive /> {archiveProject.isPending ? 'Archiving...' : 'Archive'}
    </Button>
  )
}

export default ArchiveButton
