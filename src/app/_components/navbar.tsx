"use client";
import Link from "next/link";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "stack", label: "Tech stack" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-primary/20 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Brain className="size-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">CodeMind</span>
        </Link>

        <nav className="hidden md:block">
          <ul className="flex items-center gap-6 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <Button asChild size="sm"><Link href="/dashboard" prefetch>Open dashboard</Link></Button>
      </div>
    </header>
  );
}
