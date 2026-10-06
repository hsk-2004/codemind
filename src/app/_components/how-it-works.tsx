import { ArrowDown, ArrowRight, Brain, Database, FileCode2, Github, MessageSquareText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const indexing = [
  { icon: Github, label: "GitHub repository" },
  { icon: FileCode2, label: "LLM file summaries" },
  { icon: Brain, label: "Embeddings (768-d)" },
  { icon: Database, label: "pgvector" },
];

const answering = [
  { icon: MessageSquareText, label: "Your question" },
  { icon: Search, label: "Similarity search" },
  { icon: FileCode2, label: "Top-k code context" },
  { icon: Brain, label: "Local LLM answer + sources" },
];

function Pipeline({ title, steps }: { title: string; steps: typeof indexing }) {
  return (
    <div className="rounded-xl border border-primary/15 p-6">
      <p className="mb-5 text-sm font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
            <div className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <step.icon className="size-4 shrink-0 text-primary" />
              <span className="text-sm">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <>
                <ArrowDown className="size-4 text-muted-foreground md:hidden" />
                <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground md:block" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="w-full scroll-mt-16 border-t border-primary/20 py-16 md:py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <Badge variant="secondary">How it works</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Retrieval-augmented generation for code</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The model never guesses from memory. The backend first retrieves the most relevant code from your repository and then
          asks the model to answer using only that code.
        </p>
        <div className="mt-10 space-y-5">
          <Pipeline title="1 · Indexing (once per repository)" steps={indexing} />
          <Pipeline title="2 · Answering (every question)" steps={answering} />
        </div>
      </div>
    </section>
  );
}
