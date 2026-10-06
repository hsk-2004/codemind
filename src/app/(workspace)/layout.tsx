import React, { Suspense } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { ModelSwitcher } from '@/components/codemind/model-switcher'
import { AppSidebar } from './app-sidebar'

// Applies to server actions in this segment (RAG answers can take ~30s on local models).
export const maxDuration = 300

const LayoutSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-32" />
    <Skeleton className="h-64" />
  </div>
)

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="ml-auto" />
          <ModelSwitcher />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          <Suspense fallback={<LayoutSkeleton />}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
