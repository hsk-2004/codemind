'use client'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', cs: 'csharp',
  c: 'c', cpp: 'cpp', h: 'c', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown',
  html: 'markup', css: 'css', scss: 'scss', sql: 'sql', sh: 'bash', toml: 'toml', kt: 'kotlin',
}

export function languageFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXT[ext] ?? 'text'
}

export function CodeViewer({ code, fileName, maxHeight = '60vh' }: { code: string; fileName: string; maxHeight?: string }) {
  return (
    <div className="overflow-auto rounded-md border text-xs" style={{ maxHeight }}>
      <SyntaxHighlighter
        language={languageFor(fileName)}
        style={vscDarkPlus}
        showLineNumbers
        customStyle={{ margin: 0, background: 'transparent', fontSize: '0.75rem' }}
        lineNumberStyle={{ minWidth: '2.5em', opacity: 0.4 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
