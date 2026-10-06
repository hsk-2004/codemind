import "@/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "CodeMind — AI Codebase Engineer",
  description: "Understand, search and analyse any GitHub repository with local AI models.",
  icons: [
    { rel: "icon", url: "/favicon.png", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico" },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a1a1a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Geist is bundled from the npm package, so builds never depend on Google Fonts being reachable.
    <html lang="en" className={`${GeistSans.variable} dark`}>
      <body className="overflow-x-hidden antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
