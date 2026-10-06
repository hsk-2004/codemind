'use client'

import { parseComponents } from '@/lib/parse-components'
import React from 'react'
import useProject from '@/hooks/use-project'
import { api } from '@/trpc/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

const BreakingChangesAlert = () => {
  const { projectId } = useProject()
  const { data: commits } = api.project.getCommits.useQuery({ projectId })

  const criticalBreakingChanges = React.useMemo(() => {
    if (!commits) return []
    
    return commits
      .filter(commit => 
        commit.hasBreakingChanges && 
        (commit.breakingChangeSeverity === 'critical' || commit.breakingChangeSeverity === 'high')
      )
      .slice(0, 3) // Show only the 3 most recent critical breaking changes
  }, [commits])

  if (criticalBreakingChanges.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {criticalBreakingChanges.map((commit) => (
        <Alert key={commit.id} className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 dark:text-red-200">
            Critical Breaking Change Detected
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="destructive" 
                  className="text-xs"
                >
                  {commit.breakingChangeSeverity}
                </Badge>
                {commit.migrationRequired && (
                  <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Migration Required
                  </Badge>
                )}
              </div>
              
              <p className="font-medium text-sm">
                {commit.commitMessage}
              </p>
              
              <p className="text-xs text-red-600 dark:text-red-400">
                by {commit.commitAuthorName} • {new Date(commit.commitDate).toLocaleDateString()}
              </p>
              
              {commit.breakingChangeDetails && (
                <p className="text-sm">
                  {commit.breakingChangeDetails}
                </p>
              )}
              
              {commit.affectedComponents && (
                <div>
                  <p className="text-xs font-medium mb-1">Affected Components:</p>
                  <div className="flex flex-wrap gap-1">
                    {parseComponents(commit.affectedComponents).map((component: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs border-red-300 text-red-700 dark:border-red-700 dark:text-red-300">
                        {component}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {commit.migrationSteps && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium hover:text-red-800 dark:hover:text-red-100">
                    View Migration Steps
                  </summary>
                  <div className="mt-2 p-2 bg-background rounded border border-red-200 dark:border-red-800">
                    <pre className="whitespace-pre-wrap text-xs">
                      {commit.migrationSteps}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

export default BreakingChangesAlert 