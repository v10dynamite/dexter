# Dexter — Claude Code Guidelines

> **Repo**: https://github.com/virattt/dexter
> **Stack**: TypeScript · Bun · Ink (React for CLI) · LangChain
> **Purpose**: CLI-based AI agent for deep financial research.

---

## Project Structure

```
src/
  agent/        # Agent loop, prompts, scratchpad, token counting, types
  cli.tsx        # Ink/React CLI entry (entry: src/index.tsx)
  components/   # Ink UI components
  hooks/        # React hooks (agent runner, model selection, input history)
  model/
    llm.ts       # Multi-provider LLM abstraction
  tools/
    registry.ts  # Tool registry (conditional on env vars)
    descriptions/# Rich tool descriptions injected into system prompt
    finance/     # Prices, fundamentals, filings, insider trades
    search/      # Exa (preferred) → Tavily (fallback)
    browser/     # Playwright-based web scraping
  skills/
    registry.ts  # Scans for SKILL.md at startup
    dcf/SKILL.md # Built-in DCF valuation skill
  utils/         # env, config, caching, token estimation, markdown tables
  evals/         # LangSmith evaluation runner with Ink UI
.dexter/
  settings.json  # Persisted model/provider selection (gitignored)
.env             # API keys (gitignored; see env.example)
scripts/
  release.sh
```

---

## Commands

| Action | Command |
|--------|---------|
| Install | `bun install` |
| Run | `bun run start` |
| Dev (watch) | `bun run dev` |
| Type-check | `bun run typecheck` |
| Test | `bun test` |
| Evals (full) | `bun run src/evals/run.ts` |
| Evals (sampled) | `bun run src/evals/run.ts --sample 10` |

> CI runs `bun run typecheck` and `bun test` on push/PR.

---

## Coding Style & Conventions

- **Language**: TypeScript, ESM, strict mode. JSX via React (Ink).
- **Typing**: Prefer strict types; avoid `any`.
- **Files**: Keep concise; extract helpers, do not duplicate code.
- **Comments**: Add brief comments for tricky/non-obvious logic only.
- **Logging**: Do NOT add logging unless explicitly asked.
- **Docs**: Do NOT create README or documentation files unless explicitly asked.

---

## LLM Providers

| Prefix | Provider |
|--------|----------|
| `claude-` | Anthropic |
| `gemini-` | Google |
| *(default)* | OpenAI (`gpt-5.4`) |

- Fast models for lightweight tasks: see `FAST_MODELS` in `src/model/llm.ts`.
- Anthropic uses explicit `cache_control` on system prompt for prompt caching.
- Users switch models via `/model` in the CLI.

---

## Tools

| Tool | Purpose |
|------|---------|
| `financial_search` | Primary tool for all financial data (delegates to sub-tools) |
| `financial_metrics` | Direct metric lookups (revenue, market cap, etc.) |
| `read_filings` | SEC filing reader (10-K, 10-Q, 8-K) |
| `web_search` | General web search (Exa → Tavily fallback) |
| `browser` | Playwright web scraping |
| `skill` | Invokes SKILL.md-defined workflows (max once per query) |

---

## Skills System

- Skills = `SKILL.md` files with YAML frontmatter (`name`, `description`) + markdown instructions.
- Discovery: `src/skills/registry.ts` scans at startup.
- The LLM sees skill metadata in system prompt and invokes via the `skill` tool.

---

## Agent Architecture

- **Loop**: `src/agent/agent.ts` — iterative tool-calling, max 10 iterations by default.
- **Scratchpad**: `src/agent/scratchpad.ts` — single source of truth for tool results.
- **Context**: Full results kept; oldest cleared when token threshold exceeded.
- **Final answer**: Separate LLM call with full scratchpad, no tools bound.
- **Events**: `tool_start`, `tool_end`, `thinking`, `answer_start`, `done`, etc.

---

## Environment Variables

```bash
# LLM
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434   # optional

# Finance
FINANCIAL_DATASETS_API_KEY=

# Search
EXASEARCH_API_KEY=      # preferred
TAVILY_API_KEY=          # fallback

# Tracing
LANGSMITH_API_KEY=
LANGSMITH_ENDPOINT=
LANGSMITH_PROJECT=
LANGSMITH_TRACING=
```

> **Never commit `.env` files or real API keys.**

---

## Version & Release

- Format: CalVer `YYYY.M.D` (no zero-padding). Tag prefix: `v`.
- Release: `bash scripts/release.sh [version]`
- Flow: bump `package.json` → git tag → push tag → GitHub release via `gh`.
- **Do not push or publish without user confirmation.**

---

## Testing

- **Framework**: Bun built-in test runner (primary). Jest config exists for legacy.
- Tests colocated as `*.test.ts`.
- Run `bun test` before pushing whenever logic is touched.

---

## Security

- API keys in `.env` (gitignored). Users may also enter keys interactively.
- Config in `.dexter/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.
