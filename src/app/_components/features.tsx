import { AlertTriangle, BotMessageSquare, FileSearch, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Grounded code Q&A",
    description: "Ask how something works. A LangChain RAG pipeline retrieves the relevant files and answers with citations and relevance scores. If nothing relevant exists, it says so instead of guessing.",
    icon: BotMessageSquare,
  },
  {
    title: "Semantic search",
    description: "Find code by meaning rather than keywords. Queries are embedded and matched against every indexed file with cosine similarity in pgvector.",
    icon: FileSearch,
  },
  {
    title: "Breaking-change detection",
    description: "Every analysed commit is classified by severity, with affected components and migration steps, using grammar-constrained JSON from the local model.",
    icon: AlertTriangle,
  },
  {
    title: "Repository intelligence",
    description: "Language breakdown and automatic detection of Docker, CI/CD pipelines, dependency ecosystems and test frameworks, read from the repository tree.",
    icon: GitBranch,
  },
  {
    title: "AI-enhanced CI/CD",
    description: "A GitHub Actions workflow runs CodeMind's own analysis on each pull request and posts a review, alongside lint, tests and Docker builds.",
    icon: Workflow,
  },
  {
    title: "Private by design",
    description: "Inference runs locally through Ollama, so source code is never sent to a cloud AI service. Retrieval is scoped per repository, and repository code is never executed.",
    icon: ShieldCheck,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="w-full scroll-mt-16 border-t border-primary/20 py-16 md:py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <Badge variant="secondary">Features</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">What CodeMind does</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Every feature below is implemented and runs against real repository data.</p>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="border-primary/15 transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <CardTitle className="text-base md:text-lg">{f.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{f.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
