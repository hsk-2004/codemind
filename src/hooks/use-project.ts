import { api } from '@/trpc/react'
import React, { useMemo } from 'react'
import {useLocalStorage} from 'usehooks-ts'

const useProject = () => {
  const {data:projects, isLoading} = api.project.getProjects.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
  
  const [projectId,setProjectId] = useLocalStorage('gitInspect',' ')
  
  const project = useMemo(() => {
    if (!projects || !projectId) return undefined
    return projects.find(project => project.id === projectId)
  }, [projects, projectId])

  return{
        projects,
        project,
        projectId,
        setProjectId,
        isLoading
  }
}

export default useProject