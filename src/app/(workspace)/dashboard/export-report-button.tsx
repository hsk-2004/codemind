'use client'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { ReportOptions } from '@/services/report/types'

const SECTIONS: { key: keyof ReportOptions; title: string; text: string }[] = [
  { key: 'languages', title: 'Languages and tooling', text: 'Which languages the code is written in, and whether Docker, CI and tests were found.' },
  { key: 'breaking', title: 'Breaking changes', text: 'Commits the AI flagged as risky, with how serious each one is.' },
  { key: 'answers', title: 'Saved questions and answers', text: 'The answers you saved from Ask AI, as plain text.' },
  { key: 'aiUsage', title: 'AI usage', text: 'How many model calls were made, how fast, and by which model.' },
]

/** Downloads the project summary as a PDF, with the optional sections the reader chooses. */
export function ExportReportButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [options, setOptions] = useState<ReportOptions>({ languages: true, breaking: true, answers: true, aiUsage: true })

  const download = async () => {
    setBusy(true)
    try {
      const query = new URLSearchParams({ projectId, ...Object.fromEntries(Object.entries(options).map(([k, v]) => [k, v ? '1' : '0'])) })
      const response = await fetch(`/api/report?${query}`)
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Could not build the report.')
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'codemind-report.pdf'
      const url = URL.createObjectURL(await response.blob())
      const link = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('Report downloaded', { description: name })
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build the report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileText /> Export report</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,32rem)]">
        <DialogHeader>
          <DialogTitle>Export a project report</DialogTitle>
          <DialogDescription>
            A PDF summary of this repository that you can share. It is built on this computer from what CodeMind already knows, and nothing is sent anywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-fluid-sm">
          <p className="rounded-md bg-muted/50 p-fluid-sm text-fluid-xs text-muted-foreground">
            <span className="font-medium text-foreground">Always included:</span> the project name and link, and an overview of files, chunks, commits and saved answers.
          </p>
          {SECTIONS.map((section) => (
            <div key={section.key} className="flex items-start gap-3 rounded-lg border p-fluid-sm">
              <Checkbox id={`report-${section.key}`} checked={options[section.key]} disabled={busy} onCheckedChange={(checked) => setOptions((prev) => ({ ...prev, [section.key]: checked === true }))} className="mt-0.5" />
              <Label htmlFor={`report-${section.key}`} className="block flex-1 cursor-pointer space-y-0.5 font-normal">
                <span className="block text-fluid-sm font-medium">{section.title}</span>
                <span className="block text-fluid-xs text-muted-foreground">{section.text}</span>
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void download()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} {busy ? 'Building the PDF…' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
