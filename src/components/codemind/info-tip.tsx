'use client'
import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** A small "?" that explains a technical word in plain language on hover, focus or tap. */
export function InfoTip({ children, label = 'What does this mean?' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2">
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-fluid-xs">{children}</TooltipContent>
    </Tooltip>
  )
}
