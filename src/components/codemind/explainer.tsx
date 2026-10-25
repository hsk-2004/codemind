'use client'
import { ChevronDown, Lightbulb } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface ExplainerStep {
  title: string
  text: ReactNode
}

/**
 * A short "how this page works" box in plain language. It stays open the first
 * time, and remembers if the reader closed it, so it never gets in the way.
 */
export function Explainer({ id, title = 'How this works', steps, note }: { id: string; title?: string; steps: ExplainerStep[]; note?: ReactNode }) {
  const [open, setOpen] = useLocalStorage(`codemind-explainer:${id}`, true, { initializeWithValue: false })

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-fluid-md py-fluid-sm text-left text-fluid-sm font-medium">
        <Lightbulb className="size-4 shrink-0 text-amber-500" />
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-fluid-md pb-fluid-md">
        <ol className="grid gap-fluid-sm sm:grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-lg bg-background/60 p-fluid-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-fluid-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-fluid-xs text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {note && <p className="mt-fluid-sm text-fluid-xs text-muted-foreground">{note}</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}
