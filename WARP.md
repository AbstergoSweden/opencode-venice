# WARP.md
This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repo quick facts
- Monorepo managed with Bun workspaces and Turborepo; default branch is `dev`.
- Primary code lives in `packages/opencode` (CLI/agent core). Shared UI lives in `packages/app` + `packages/ui`; marketing/docs in `packages/web`; admin console in `packages/console/*`; desktop Tauri shell in `packages/desktop`; Slack bot in `packages/slack`; JS SDK in `packages/sdk/js`.

## Commands
- Install all deps: `bun install`.
- Typecheck all packages: `bun turbo typecheck`.
- Root tests are intentionally disabled (`bun test` in root exits 1); run tests per package instead.

### packages/opencode (CLI/agent core)
- Dev/CLI entry: `bun run --conditions=browser ./src/index.ts` (or from repo root: `bun run dev`).
- Build CLI: `bun run script/build.ts`.
- Tests: `bun test`; single file: `bun test test/tool/tool.test.ts`.
- Typecheck: `bun run typecheck`.

### packages/sdk/js
- Regenerate SDK: `./packages/sdk/js/script/build.ts`.
- Typecheck: `bun run --cwd packages/sdk/js typecheck`.

### packages/app (Solid UI client)
- Dev server: `bun run --cwd packages/app dev` (defaults to http://localhost:3000).
- Build: `bun run --cwd packages/app build`.
- Typecheck: `bun run --cwd packages/app typecheck`.

### packages/console
- App (SolidStart UI): `bun run --cwd packages/console/app dev`; build: `bun run --cwd packages/console/app build`; typecheck: `bun run --cwd packages/console/app typecheck`.
- Core (backend/domain): `bun run --cwd packages/console/core typecheck`; DB utilities via SST shells (e.g., `bun run --cwd packages/console/core db-dev`).
- Function (edge APIs): `bun run --cwd packages/console/function typecheck`.
- Mail previews: `bun run --cwd packages/console/mail dev`.
- Resource shim: runtime picked via exports; no routine scripts beyond typecheck.

### packages/web (Astro site)
- Dev: `bun run --cwd packages/web dev`; build: `bun run --cwd packages/web build`.

### packages/ui
- Dev playground: `bun run --cwd packages/ui dev`.
- Typecheck: `bun run --cwd packages/ui typecheck`.
- Tailwind sprite generation: `bun run --cwd packages/ui generate:tailwind`.

### packages/desktop
- Prep + dev: `bun run --cwd packages/desktop predev` then `bun run --cwd packages/desktop dev`.
- Build: `bun run --cwd packages/desktop build`.
- Typecheck: `bun run --cwd packages/desktop typecheck`.

### packages/slack
- Dev bot: `bun run --cwd packages/slack dev`.
- Typecheck: `bun run --cwd packages/slack typecheck`.

### Other packages
- `packages/plugin`: build with `bun run --cwd packages/plugin build`; typecheck with `bun run --cwd packages/plugin typecheck`.
- `packages/util`: typecheck with `bun run --cwd packages/util typecheck`.
- `packages/function`: typecheck with `bun run --cwd packages/function typecheck`.
- `packages/script`: no scripts beyond exports; used by other packages.

## Architecture (big picture)
- **CLI/Agent core (`packages/opencode`)**: Yargs-based entry (`src/index.ts`) wires subcommands for run/generate/auth/agent/upgrade/uninstall/serve/web/tui (attach/spawn/thread)/mcp/github/pr/session/stats/acp. Providers under `src/provider` include Venice integration; server layer (`src/server`) handles project discovery, mdns advertizing, and TUI bridge. Logging via `Log` utility and `Installation` metadata; CLI is the operational heart for agents.
- **UI stack**: `packages/app` supplies the main Solid-based client UI; `packages/ui` exposes shared components, hooks, theme, icons, and Tailwind artifacts. These feed the desktop shell (`packages/desktop`, Tauri) and other frontends.
- **Console suite (`packages/console/*`)**: `console/app` is the console UI (SolidStart + Vite); `console/core` holds domain logic, Stripe/Drizzle DB, and SST shell scripts; `console/function` hosts edge APIs (Hono, AI SDK); `console/resource` provides runtime-specific resource exports; `console/mail` contains JSX email templates.
- **Web docs/landing (`packages/web`)**: Astro + Solid for marketing and docs; depends on shared SDK/UI.
- **SDKs and integrations**: `packages/sdk/js` is the generated JS SDK (rebuild via script); `packages/plugin` offers SDK-based plugin scaffolding; `packages/slack` implements a Slack Bolt bot; `packages/function` contains a small Hono/Octokit worker-style service.
- **Shared utilities**: `packages/util` provides Zod-based helpers; `packages/script` offers shared scripts consumed by other packages.

## Venice Provider
The Venice AI provider (`packages/opencode/src/provider/venice.ts`) integrates OpenCode with Venice.ai's API.

### Configuration
- Set `VENICE_API_KEY` in environment or add to `opencode.json`:
  ```json
  { "provider": { "venice": { "options": { "apiKey": "your-key" } } } }
  ```

### Key Features
- Capability caching from `/models` endpoint (5 min TTL)
- Character personas via `getVeniceModelWithCharacter(modelId, characterSlug, apiKey)`
- Exponential backoff retry for rate limits (max 3 retries)
- Streaming via `getVeniceModelWithStreaming()`
- Health checks via `checkHealth()` / `getVeniceStatus()`
- Multimodal: `generateImage()`, `upscaleImage()`, `editImage()`, `generateEmbeddings()`

### Venice CLI
Standalone chat interface at `src/cli/venice-cli.ts`:
- `/model [id]` - Switch model
- `/character [slug]` - Switch Venice character
- `/list-characters` - List available characters
- `/stream` - Toggle streaming output
- `/status` - Check API status

### Testing
```bash
bun test test/provider/venice.test.ts  # Unit tests
VENICE_API_KEY=xxx bun test test/provider/venice-integration.test.ts  # Integration
```

### Sources of Truth
- https://docs.venice.ai/overview/getting-started
- https://docs.venice.ai/api-reference/endpoint/chat/completions
- https://docs.venice.ai/api-reference/rate-limiting

## Development notes & guardrails
- Use parallel tool calls when possible (house rule).
- Default branch is `dev`.
- For `packages/app` Playwright MCP flows, the app is assumed already running at http://localhost:3000; **do not restart the app or server process**. Prefer Solid `createStore` over multiple `createSignal` calls.
- To exercise the CLI locally, prefer running inside `packages/opencode`; root `bun test` intentionally fails.
- Keep TODOs in sync with `TODO.md` when making changes.
