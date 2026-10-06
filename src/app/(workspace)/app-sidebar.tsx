'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, BarChart3, Bot, Brain, FileCode2, LayoutDashboard, Plus, Search } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { StatusBadge } from '@/components/codemind/status-badge'
import useProject from '@/hooks/use-project'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Ask AI', url: '/qa', icon: Bot },
  { title: 'Semantic Search', url: '/search', icon: Search },
  { title: 'Repository Files', url: '/files', icon: FileCode2 },
  { title: 'AI Metrics', url: '/metrics', icon: BarChart3 },
  { title: 'System Status', url: '/system', icon: Activity },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { open, setOpenMobile } = useSidebar()
  const { projects, projectId, setProjectId } = useProject()
  const { data: status } = api.system.status.useQuery(undefined, { refetchInterval: 60_000, staleTime: 30_000 })
  const aiReady = status ? status.ollama.ok && status.llm.installed && status.embedding.installed : undefined

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-1 py-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Brain className="size-4" />
          </div>
          {open && (
            <div className="leading-tight">
              <p className="text-base font-semibold">CodeMind</p>
              <p className="text-[11px] text-muted-foreground">AI Codebase Engineer</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                    <Link href={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Repositories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects?.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    tooltip={project.name}
                    isActive={project.id === projectId}
                    onClick={() => {
                      setProjectId(project.id)
                      if (pathname === '/create') router.push('/dashboard')
                      setOpenMobile(false)
                    }}
                  >
                    <div
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold uppercase',
                        project.id === projectId && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {project.name[0]}
                    </div>
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/create'} tooltip="Connect repository">
                  <Link href="/create">
                    <Plus />
                    <span>Connect repository</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {open && (
        <SidebarFooter>
          <Link href="/system" className="rounded-md border p-3 text-xs hover:bg-accent">
            <div className="flex items-center justify-between">
              <span className="font-medium">{status?.llm.location === 'cloud' ? 'Cloud model' : 'Local model'}</span>
              <StatusBadge ok={aiReady} okLabel="Ready" failLabel="Not ready" />
            </div>
            <p className="mt-1.5 truncate text-muted-foreground">{status?.llm.model ?? '…'}</p>
          </Link>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
