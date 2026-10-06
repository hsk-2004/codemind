'use client'

import { parseComponents } from '@/lib/parse-components'
import React, { useMemo } from 'react'
import useProject from '@/hooks/use-project'
import { api } from '@/trpc/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, TrendingUp, AlertCircle, XCircle, CheckCircle, BarChart3 } from 'lucide-react'

const BreakingChangesMonitorSimple = () => {
  const { projectId } = useProject()
  const { data: commits } = api.project.getCommits.useQuery({ projectId })

  const breakingChangesData = useMemo(() => {
    if (!commits) return null

    // Filter commits with breaking changes
    const breakingCommits = commits.filter(commit => commit.hasBreakingChanges)
    const nonBreakingCommits = commits.filter(commit => !commit.hasBreakingChanges)

    // Group by severity
    const severityCounts = breakingCommits.reduce((acc, commit) => {
      const severity = commit.breakingChangeSeverity || 'unknown'
      acc[severity] = (acc[severity] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Time series data (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const timeSeriesData = commits
      .filter(commit => new Date(commit.commitDate) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.commitDate).getTime() - new Date(b.commitDate).getTime())

    // Weekly aggregation
    const weeklyData = timeSeriesData.reduce((acc, item) => {
      const week = new Date(item.commitDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
      if (!acc[week]) {
        acc[week] = { breaking: 0, total: 0, week }
      }
      acc[week].breaking += item.hasBreakingChanges ? 1 : 0
      acc[week].total += 1
      return acc
    }, {} as Record<string, { breaking: number; total: number; week: string }>)

    return {
      totalCommits: commits.length,
      breakingCommits: breakingCommits.length,
      nonBreakingCommits: nonBreakingCommits.length,
      severityCounts,
      timeSeriesData,
      weeklyData: Object.values(weeklyData),
      recentBreakingChanges: breakingCommits.slice(0, 5), // Last 5 breaking changes
    }
  }, [commits])

  if (!breakingChangesData) {
    return <div>Loading breaking changes data...</div>
  }

  const { 
    totalCommits, 
    breakingCommits, 
    severityCounts, 
    weeklyData, 
    recentBreakingChanges 
  } = breakingChangesData

  const breakingChangePercentage = totalCommits > 0 ? (breakingCommits / totalCommits) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCommits}</div>
            <p className="text-xs text-muted-foreground">
              All analysed commits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Breaking Changes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{breakingCommits}</div>
            <p className="text-xs text-muted-foreground">
              {breakingChangePercentage.toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {breakingChangePercentage > 20 ? (
                <span className="text-red-500">High</span>
              ) : breakingChangePercentage > 10 ? (
                <span className="text-yellow-500">Medium</span>
              ) : (
                <span className="text-green-500">Low</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on breaking change rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Migration Required</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {recentBreakingChanges.filter(c => c.migrationRequired).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Recent commits
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Simple Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend - Simple Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Breaking Changes Trend (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length > 0 ? (
              <div className="space-y-4">
                {weeklyData.map((week, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{week.week}</span>
                      <span className="font-medium">
                        {week.breaking} / {week.total} commits
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${week.total > 0 ? (week.breaking / week.total) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data available for the selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Severity Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Breaking Changes by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(severityCounts).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(severityCounts).map(([severity, count]) => (
                  <div key={severity} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          severity === 'critical' ? 'destructive' :
                          severity === 'high' ? 'destructive' :
                          severity === 'medium' ? 'secondary' :
                          'outline'
                        }
                      >
                        {severity}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            severity === 'critical' ? 'bg-red-700' :
                            severity === 'high' ? 'bg-red-500' :
                            severity === 'medium' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ 
                            width: `${(count / breakingCommits) * 100}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No breaking changes detected
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Breaking Changes */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Breaking Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBreakingChanges.length > 0 ? (
            <div className="space-y-4">
              {recentBreakingChanges.map((commit) => (
                <div key={commit.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant={
                            commit.breakingChangeSeverity === 'critical' ? 'destructive' :
                            commit.breakingChangeSeverity === 'high' ? 'destructive' :
                            commit.breakingChangeSeverity === 'medium' ? 'secondary' :
                            'outline'
                          }
                        >
                          {commit.breakingChangeSeverity || 'unknown'}
                        </Badge>
                        {commit.migrationRequired && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            Migration Required
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-medium text-sm mb-1">{commit.commitMessage}</h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        by {commit.commitAuthorName} • {new Date(commit.commitDate).toLocaleDateString()}
                      </p>
                      {commit.breakingChangeDetails && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {commit.breakingChangeDetails}
                        </p>
                      )}
                      {commit.affectedComponents && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Affected Components:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {parseComponents(commit.affectedComponents).map((component: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {component}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {commit.migrationSteps && (
                        <details className="text-sm">
                          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                            Migration Steps
                          </summary>
                          <div className="mt-2 p-3 bg-muted rounded-md">
                            <pre className="whitespace-pre-wrap text-xs">{commit.migrationSteps}</pre>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No breaking changes detected in recent commits</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default BreakingChangesMonitorSimple 