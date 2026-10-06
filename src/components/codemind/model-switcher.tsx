'use client'
import { Cloud, Cpu, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/trpc/react'

const SEPARATOR = '::'

/** Lets the user switch the chat model between local (Ollama) and cloud (Gemini, Groq) models. */
export function ModelSwitcher() {
  const utils = api.useUtils()
  const { data, isLoading } = api.models.list.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false })
  const setActive = api.models.setActive.useMutation({
    onSuccess: async (model) => {
      if (model.location === 'cloud') {
        toast.warning(`Using ${model.label}: ${model.model}`, {
          description: 'Cloud model selected. Repository code in prompts will be sent to this provider.',
        })
      } else {
        toast.success(`Using local model: ${model.model}`, { description: 'Code stays on this machine.' })
      }
      await Promise.all([utils.models.list.invalidate(), utils.system.status.invalidate()])
    },
    onError: (error) => toast.error(error.message),
  })

  if (isLoading || !data) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Models…
      </div>
    )
  }

  const value = `${data.active.provider}${SEPARATOR}${data.active.model}`
  const isCloud = data.active.location === 'cloud'
  // Keep the active model selectable even if its provider's list failed to load.
  const activeListed = data.providers.some((p) => p.provider === data.active.provider && p.models.some((m) => m.model === data.active.model))

  return (
    <Select
      value={value}
      disabled={setActive.isPending}
      onValueChange={(next) => {
        const index = next.indexOf(SEPARATOR)
        const provider = next.slice(0, index) as 'ollama' | 'gemini' | 'groq'
        setActive.mutate({ provider, model: next.slice(index + SEPARATOR.length) })
      }}
    >
      <SelectTrigger className="h-9 max-w-[58vw] gap-2 sm:max-w-xs" aria-label="Chat model">
        {setActive.isPending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : isCloud ? (
          <Cloud className="size-3.5 shrink-0 text-amber-500" />
        ) : (
          <Cpu className="size-3.5 shrink-0 text-emerald-500" />
        )}
        <span className="truncate text-xs sm:text-sm"><SelectValue /></span>
      </SelectTrigger>
      <SelectContent align="end" className="max-h-[70vh]">
        {!activeListed && (
          <SelectGroup>
            <SelectLabel>Current</SelectLabel>
            <SelectItem value={value}>{data.active.model}</SelectItem>
          </SelectGroup>
        )}
        {data.providers.map((provider, i) => (
          <div key={provider.provider}>
            {(i > 0 || !activeListed) && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-1.5">
                {provider.location === 'cloud' ? <Cloud className="size-3 text-amber-500" /> : <Cpu className="size-3 text-emerald-500" />}
                {provider.label} · {provider.location === 'cloud' ? 'Cloud' : 'Local'}
              </SelectLabel>
              {!provider.configured && <p className="px-2 pb-2 text-xs text-muted-foreground">Add an API key in .env to enable.</p>}
              {provider.configured && provider.error && <p className="max-w-64 px-2 pb-2 text-xs text-red-400">{provider.error}</p>}
              {provider.configured && !provider.error && provider.models.length === 0 && (
                <p className="px-2 pb-2 text-xs text-muted-foreground">No chat models found.</p>
              )}
              {provider.models.map((m) => (
                <SelectItem key={`${m.provider}${SEPARATOR}${m.model}`} value={`${m.provider}${SEPARATOR}${m.model}`}>
                  {m.model}
                  {m.note && <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>}
                </SelectItem>
              ))}
            </SelectGroup>
          </div>
        ))}
      </SelectContent>
    </Select>
  )
}
