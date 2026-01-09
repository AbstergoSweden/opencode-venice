# Copilot Instructions

## Project overview
- OpenCode is a provider-agnostic AI coding agent with client/server architecture plus TUI-first experience; built as a TypeScript monorepo using Bun + Turborepo, SolidJS, SST, and Tauri.
- Purpose of this fork: integrate Venice.ai APIs (streaming, agents, characters) while keeping general AI/tooling support.

## Key workspaces
- `packages/opencode`: core server, agent logic, TUI (SolidJS + opentui).
- `packages/app`: web UI; `packages/desktop`: Tauri desktop wrapper.
- `packages/console`: console app (SolidStart + SST); `packages/plugin`: plugin system; `packages/sdk`: SDKs.

## Run/build/test
- Install: `bun install`.
- Core/TUI dev: `bun dev` (in repo root or `packages/opencode`).
- Web UI: `bun run --cwd packages/app dev`; Desktop: `bun run --cwd packages/desktop tauri dev`.
- Build standalone: `./packages/opencode/script/build.ts --single`; run binary from `./packages/opencode/dist/...`.
- Tests: per-package Bun tests; console/TUI use `bun dev`.
- Regenerate JS SDK: `./packages/sdk/js/script/build.ts`.

## Agents
- Built-ins: `build` (full access), `plan` (read-only/ask-before bash), `general` subagent for complex searches (`@general`).

## Conventions
- Prefer functional style; immutability (`const`), avoid `let`/`any`/`else`/unneeded destructuring.
- Use Bun APIs when possible; strict types.
- Commits: Conventional Commits; PRs must link issues. UI changes need screenshots.

## Venice integration
- Base URL: `https://api.venice.ai/api/v1`; API key env: `VENICE_API_KEY`.
- Use model traits (e.g., coding-focused) and characters via `venice_parameters.character_slug`; support streaming and tool_calls.
- Key reference links (source of truth): deprecations, beta models, pricing, privacy, getting-started, about-venice, generating-api-key-agent, ai-agents, postman, integrations, structured-responses, models (overview/text/image/audio/video), embeddings generate, api-spec, rate-limiting, error-codes, chat completions, image (generate/upscale/edit/styles/generations), models list/compatibility_mapping/traits, characters (get/list), changelog, status.

## Practical guidance
- Default branch: `dev`.
- TUI optimized for terminal (Neovim-friendly); architecture supports additional CLI loops.
- Environment vars commonly used: `VENICE_API_KEY`, `OPENCODE_INSTALL_DIR`, `XDG_BIN_DIR`, `AGENT=1`, `OPENCODE=1`.
- Debugging: `bun run --inspect=<url> dev ...`; server attach `bun run --inspect=ws://localhost:6499/ ./src/index.ts serve --port 4096`; TUI attach via `opencode attach`.

## Scope for enhancements
- Add/extend CLI chat loop leveraging existing agents and Venice tool_calls/characters.
- Keep integrations provider-agnostic; follow style and safety guidelines above.
