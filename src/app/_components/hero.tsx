import Link from "next/link";
import { ArrowRight, Bot, Cpu, FileCode2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLE_SOURCES = [
  { file: "src/auth/session.ts", score: 91 },
  { file: "src/middleware.ts", score: 84 },
  { file: "src/routes/login.ts", score: 77 },
];

/** Static illustration of a CodeMind answer (labelled as an example, not live output). */
function AnswerPreview() {
  return (
    <div className="w-full rounded-xl border border-primary/30 bg-card/60 p-5 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Example</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-500">
          <ShieldCheck className="size-3" /> Grounded in 3 sources
        </span>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">Where is authentication handled?</div>

      <div className="mt-4 flex gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sessions are validated in <code className="rounded bg-muted px-1 text-foreground">src/middleware.ts</code>, which calls the
          session helper in <code className="rounded bg-muted px-1 text-foreground">src/auth/session.ts</code> before protected routes run…
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Sources</p>
        {EXAMPLE_SOURCES.map((s) => (
          <div key={s.file} className="flex items-center gap-3 rounded-md border px-3 py-2">
            <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.file}</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.score}%` }} />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{s.score}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_50%_at_50%_0%,_oklch(0.25_0_0)_0%,_transparent_60%)]" />
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl grid-cols-1 items-center gap-10 px-6 py-16 md:grid-cols-2">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> AI Codebase Engineer
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Understand. Search. Debug. Test. Improve.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            CodeMind indexes a GitHub repository and answers questions about its code with retrieval-augmented generation,
            citing the exact files it used. It also flags commits that may break things. Everything runs on local AI models.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <Button asChild size="lg">
              <Link href="/dashboard">Open dashboard <ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground md:justify-start">
            <span className="inline-flex items-center gap-2"><Lock className="size-4" /> Code never leaves your machine</span>
            <span className="inline-flex items-center gap-2"><Cpu className="size-4" /> Runs on a 4 GB GPU</span>
          </div>
        </div>

        <AnswerPreview />
      </div>
    </section>
  );
}
