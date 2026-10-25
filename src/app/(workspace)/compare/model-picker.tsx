'use client'
import { Cloud, Cpu, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MAX_COMPARED_MODELS, modelKey, modelSizeLabel, parseModelKey } from '@/lib/compare'
import type { RouterOutputs } from '@/trpc/react'

export type ModelCatalog = RouterOutputs['models']['list']

/** Finds the catalog entry of a "provider::model" key, to show its size. */
export function findModel(catalog: ModelCatalog | undefined, key: string) {
  const { provider, model } = parseModelKey(key)
  return catalog?.providers.find((p) => p.provider === provider)?.models.find((m) => m.model === model)
}

/** The models to start with: each provider's default, as long as that provider is ready. */
export function defaultSelection(catalog: ModelCatalog): string[] {
  return catalog.providers
    .map((provider) => {
      const wanted = catalog.defaults[provider.provider]
      const model = provider.models.find((m) => m.model === wanted) ?? provider.models[0]
      return provider.configured && !provider.error && model ? modelKey(provider.provider, model.model) : undefined
    })
    .filter((key): key is string => key !== undefined)
}

interface Props {
  catalog: ModelCatalog
  selected: string[]
  onChange: (selected: string[]) => void
  disabled?: boolean
}

/** One row per model to compare: pick any local or cloud model, up to four. */
export function ModelPicker({ catalog, selected, onChange, disabled }: Props) {
  const setRow = (index: number, key: string) => onChange(selected.map((k, i) => (i === index ? key : k)))

  return (
    <div className="space-y-fluid-sm">
      <ul className="grid gap-fluid-sm sm:grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))]">
        {selected.map((key, index) => {
          const { provider } = parseModelKey(key)
          const entry = findModel(catalog, key)
          return (
            <li key={`${index}-${key}`} className="flex items-center gap-2 rounded-lg border bg-card p-fluid-xs">
              <Select value={key} disabled={disabled} onValueChange={(next) => setRow(index, next)}>
                <SelectTrigger className="h-auto min-h-10 flex-1 gap-2 border-0 bg-transparent px-2 py-1 shadow-none" aria-label={`Model ${index + 1}`}>
                  {provider === 'ollama' ? <Cpu className="size-4 shrink-0 text-emerald-500" /> : <Cloud className="size-4 shrink-0 text-amber-500" />}
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-fluid-sm font-medium"><SelectValue /></span>
                    <span className="block truncate text-fluid-xs text-muted-foreground">{modelSizeLabel({ provider, model: parseModelKey(key).model, sizeBytes: entry?.sizeBytes })}</span>
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-[70vh]">
                  {catalog.providers.map((p, i) => (
                    <div key={p.provider}>
                      {i > 0 && <SelectSeparator />}
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5">
                          {p.location === 'cloud' ? <Cloud className="size-3 text-amber-500" /> : <Cpu className="size-3 text-emerald-500" />}
                          {p.label} · {p.location === 'cloud' ? 'Cloud' : 'Local'}
                        </SelectLabel>
                        {!p.configured && <p className="px-2 pb-2 text-xs text-muted-foreground">Add an API key in .env to enable.</p>}
                        {p.configured && p.error && <p className="max-w-64 px-2 pb-2 text-xs text-red-400">{p.error}</p>}
                        {p.models.map((m) => {
                          const value = modelKey(m.provider, m.model)
                          return (
                            <SelectItem key={value} value={value} disabled={selected.includes(value) && value !== key}>
                              {m.model}
                              {m.note && <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>}
                            </SelectItem>
                          )
                        })}
                      </SelectGroup>
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {selected.length > 1 && (
                <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" disabled={disabled} aria-label={`Remove ${parseModelKey(key).model}`} onClick={() => onChange(selected.filter((_, i) => i !== index))}>
                  <X />
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {selected.length < MAX_COMPARED_MODELS && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            const taken = new Set(selected)
            const next = catalog.providers
              .filter((p) => p.configured && !p.error)
              .flatMap((p) => p.models)
              .find((m) => !taken.has(modelKey(m.provider, m.model)))
            if (next) onChange([...selected, modelKey(next.provider, next.model)])
          }}
        >
          <Plus /> Add a model ({selected.length}/{MAX_COMPARED_MODELS})
        </Button>
      )}
    </div>
  )
}
