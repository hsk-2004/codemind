'use client'

import { parseComponents } from '@/lib/parse-components'
import React, { useMemo } from 'react'
import useProject from '@/hooks/use-project'
import { api } from '@/trpc/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, TrendingUp, AlertCircle, XCircle, CheckCircle } from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const BreakingChangesMonitor = () => {
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
      .map(commit => ({
        date: new Date(commit.commitDate).toLocaleDateString(),
        breaking: commit.hasBreakingChanges ? 1 : 0,
        severity: commit.breakingChangeSeverity || 'none',
        commitHash: commit.commitHash,
        commitMessage: commit.commitMessage,
      }))

    // Weekly aggregation
    const weeklyData = timeSeriesData.reduce((acc, item) => {
      const week = new Date(item.date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
      if (!acc[week]) {
        acc[week] = { breaking: 0, total: 0, week }
      }
      acc[week].breaking += item.breaking
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

  // Chart configurations
  const severityChartConfig = {
    low: { color: "#10b981", label: "Low" },
    medium: { color: "#f59e0b", label: "Medium" },
    high: { color: "#ef4444", label: "High" },
    critical: { color: "#7c2d12", label: "Critical" },
    unknown: { color: "#6b7280", label: "Unknown" },
  }

  const trendChartConfig = {
    breaking: { color: "#ef4444", label: "Breaking Changes" },
    total: { color: "#3b82f6", label: "Total Commits" },
  }

  // Prepare pie chart data
  const pieData = Object.entries(severityCounts).map(([severity, count]) => ({
    name: severityChartConfig[severity as keyof typeof severityChartConfig]?.label || severity,
    value: count,
    color: severityChartConfig[severity as keyof typeof severityChartConfig]?.color || "#6b7280",
  }))

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
              Last 30 days
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Breaking Changes Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="breaking"
                  stroke="var(--color-breaking)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-breaking)", strokeWidth: 2, r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-total)"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={{ fill: "var(--color-total)", strokeWidth: 1, r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Severity Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Breaking Changes by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
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

export default BreakingChangesMonitor 