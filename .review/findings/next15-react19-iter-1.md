# Next 15 / React 19 Upgrade Review — iter-1

Scope: Next 14.2.35 → 15.5.18, React 18 → 19.2.6. `tsc --noEmit` and `next build` both pass.

## Verdict matrix

| # | Concern | Status | Evidence |
|---|---|---|---|
| 1 | `useFormState` → `useActionState` | PASS | `grep useFormState` across `**/*.{ts,tsx}` returns zero hits. Nothing to migrate. |
| 2 | `forwardRef` usage | PASS (deprecation note) | Only 9 callsites, all in `lib/hermes-plugin-sdk.ts:127–173`. React 19 still ships `forwardRef`; these continue to work. Optional cleanup, not breakage. |
| 3 | `useRef<T>()` with no initial value | PASS | Every `useRef` call passes an initial value. Surveyed all hits: `app/agents/page.tsx:15` (`useRef(false)`), `app/calendar/page.tsx:27` (`useRef(false)`), `app/chat/page.tsx:589,593,602–610` (all pass `null`, `'general'`, `false`, etc.), `app/terminal/page.tsx:206–207` (`useRef<string \| null>(null)`), `components/layout/TopAppBar.tsx:15`, `components/overview/ActivityFeed.tsx:29`, `components/terminal/TerminalOutput.tsx:43`, `components/terminal/TerminalInput.tsx:15`, `components/kanban/HermesNativeKanbanHost.tsx:22` (`React.useRef(true)`). No bare `useRef<T>()`. Type-checks under `@types/react@^19.2.14`. |
| 4 | `Element.ref` access | PASS | `grep \.ref\b` over `*.{ts,tsx}` returns zero hits. No code reads `.ref` off a JSX element. |
| 5 | next-auth@4 compat | PASS (shape) | `app/auth/signin/page.tsx` is `'use client'`, imports `signIn` from `next-auth/react`, renders one button → `signIn('google', { callbackUrl: '/' })`. `app/auth/error/page.tsx` wraps `useSearchParams()` content in `<Suspense fallback={null}>` (required by Next 15 for client search-param hooks during prerender). Both files are pure presentational + one hook call — no React-18-only API surface (no legacy `ReactDOM.render`, no string refs, no `unstable_*`). Compatible. |
| 6 | dnd-kit compat | PASS (unused) | `grep "from '@dnd-kit'"` over `*.{ts,tsx}` returns zero hits. `@dnd-kit/*` is declared in `package.json:21–23` but no source imports it. `components/kanban/KanbanColumn.tsx` and `components/kanban/TaskCard.tsx` use native HTML5 DnD (`onDragStart`, `onDrop`, `e.dataTransfer`) — no library coupling. Nothing to break. (Suggest: drop the three `@dnd-kit/*` deps in a follow-up.) |
| 7 | react-markdown@9 + remark-gfm@4 | PASS | `components/memory/MemoryReadingView.tsx:4–5` imports `ReactMarkdown` from `react-markdown` and `remarkGfm` from `remark-gfm`. react-markdown@9 officially supports React 19; remark-gfm@4 is the matching plugin major. Standard usage, no deprecated props. |
| 8 | lucide-react imports | PASS | Named imports used throughout (`ArrowUp`, `Plus`, `RefreshCw`, `MessageSquare`, `Link2`, `ChevronRight`, `X`, `AlertTriangle`, etc., per `app/chat/page.tsx:7`, `app/agents/page.tsx:7`, `app/calendar/page.tsx:12`, `components/kanban/TaskCard.tsx:3`, `components/memory/MemoryReadingView.tsx:3`). lucide-react 0.400 is React-18/19 agnostic — no peer-dep conflict. |
| 9 | Page/Layout types under Next 15 | PASS | All seven spot-checked pages are zero-prop default exports (`export default function FooPage()`), so the Next-15 change to async `params`/`searchParams` PageProps doesn't apply. `app/kanban/page.tsx:13` is the only server page (no `'use client'`) and reads `process.env` directly — fine. The rest (`app/page.tsx`, `app/chat/page.tsx`, `app/calendar/page.tsx`, `app/terminal/page.tsx`, `app/agents/page.tsx`, `app/memory/page.tsx`) are client components with no `params` consumption. |
| 10 | `'use client'` correctness | PASS | Every page that uses `useState`/`useEffect`/`useRef`/`useSearchParams` opens with `'use client'` on line 1: `app/page.tsx`, `app/memory/page.tsx`, `app/chat/page.tsx`, `app/agents/page.tsx`, `app/calendar/page.tsx`, `app/terminal/page.tsx`, `app/auth/signin/page.tsx`, `app/auth/error/page.tsx`. `app/kanban/page.tsx` correctly omits it (server component, no hooks). |

## Summary

All ten concerns: **PASS**. No SUSPECT, no BROKEN.

Two follow-up suggestions (not blockers):
- `lib/hermes-plugin-sdk.ts`: `forwardRef` wrappers can be flattened to plain components since refs are now props in React 19. Keep as-is if plugin ABI stability matters.
- `package.json`: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are unused — safe to remove.
