import { Badge } from "@/components/ui/badge";

const groups = [
  { title: "Local AI", items: ["Ollama", "qwen2.5-coder:3b-instruct", "nomic-embed-text", "LangChain"] },
  { title: "Application", items: ["Next.js 15", "TypeScript", "tRPC", "Tailwind CSS", "shadcn/ui"] },
  { title: "Data", items: ["PostgreSQL 16", "pgvector", "Prisma", "Qdrant"] },
  { title: "DevOps", items: ["Docker", "Docker Compose", "GitHub Actions", "Vitest", "GHCR"] },
];

export function TechStackSection() {
  return (
    <section id="stack" className="w-full scroll-mt-16 border-t border-primary/20 py-16 md:py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <Badge variant="secondary">Tech stack</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Built with</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g.title} className="rounded-xl border border-primary/15 p-5">
              <p className="mb-3 text-sm font-medium">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((item) => (
                  <Badge key={item} variant="outline" className="font-normal">{item}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer className="mx-auto mt-16 w-full max-w-7xl px-6 text-sm text-muted-foreground">
        CodeMind · CSE 4011 Intelligent Developer Tools and AI DevOps Workflows
      </footer>
    </section>
  );
}
