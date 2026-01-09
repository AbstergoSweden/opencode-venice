# OpenCode-Venice TODO (comprehensive)

## Foundation & Environment
- [ ] Verify Bun 1.3+ / Node toolchain works in CI and local (bootstrap via `bun install`, `bun dev` in `packages/opencode`), and document fallback if Bun is unavailable.
- [ ] Ensure Nix flakes and Turbo cache are configured for reproducible installs; align `bun.lock`/`flake.lock` with current dependencies.
- [ ] Standardize environment variables (`VENICE_API_KEY`, `OPENCODE_INSTALL_DIR`, `XDG_BIN_DIR`, `AGENT`, `OPENCODE`) across CLI, TUI, desktop, and console.

## Venice Provider Integration
- [ ] Add/verify Venice provider config (base URL `https://api.venice.ai/api/v1`, auth header, default coding model trait) and wire into provider registry.
- [ ] Implement capability fetch & caching from `/models` + `/models/traits` + compatibility mapping; surface coding/agentic traits (tool-calling, web search, structured responses).
- [ ] Handle rate limiting/retries, error code mapping, and privacy expectations per sources of truth (pricing, deprecations, beta models, status).
- [ ] Add structured response + `response_format` support and validation paths for Venice; expose schema selection in agents.
- [ ] Implement tool-calling loop for Venice responses (`tool_calls`), including safe execution layer (bash/write/exec) with permission gates from AGENTS.md.
- [ ] Support Venice characters: list `/characters`, select, and pass `venice_parameters.character_slug`; expose UX in CLI/TUI/web/desktop.
- [ ] Enable streaming across chat/image endpoints; confirm SSE parsing compatibility.
- [ ] Cover multimodal endpoints (image generate/upscale/edit/styles/generations, audio/video, embeddings) with upload/download handling.

## Agents, CLI, and TUI Experience
- [ ] Add pure CLI chat loop (non-TUI) with history persistence, streaming output, and agent switching (`build`/`plan`/`general`).
- [ ] Extend TUI prompts to surface Venice model picker, character selection, tool-call visibility, and web-search toggles.
- [ ] Enforce agent permissions (plan=read-only, ask-before-bash) in Venice tool execution paths; audit `permission/` and `tool/` modules.
- [ ] Add debugging affordances (trace IDs, request/response logging with redaction) for Venice calls.

## SDKs, Plugins, and Scripts
- [ ] Regenerate JS SDK via `./packages/sdk/js/script/build.ts`; publish/update docs and typings for Venice endpoints and traits.
- [ ] Align plugin APIs and console/web clients with new Venice capabilities (tools, structured responses, characters).
- [ ] Update installer/upgrade scripts to inject Venice defaults and validate env keys.

## Apps (Web, Desktop, Console)
- [ ] Wire Venice provider selection and pricing display into web/console UIs; add character/model selectors and streaming indicators.
- [ ] For desktop (Tauri), ensure IPC and local file access policies honor agent permissions when executing Venice tool calls.

## Infrastructure & Operations
- [ ] Update SST stacks/secrets to include `VENICE_API_KEY`, rate-limit config, and observability (logs/metrics) for Venice requests.
- [ ] Add health checks/status surfacing from `veniceai-status.com`; fall back gracefully during outages.

## Quality, Security, and Testing
- [ ] Add unit/integration tests for Venice provider adapter, tool-call loop, structured responses, and character selection.
- [ ] Add end-to-end coverage for CLI/TUI chat flows with streaming and tool execution safety (sandbox code execution).
- [ ] Run lint/typecheck/test matrices per package (`bun turbo typecheck`, package tests) and document any Venice-specific fixtures.
- [ ] Perform security review for tool execution (no raw eval; sandbox/bounding for bash/write), credentials handling, and logging redaction.

## Documentation & Guides
- [ ] Update AGENTS.md, GEMINI.md, QWEN.md, copilotinstructions.md, and user docs with Venice-specific flows (setup, examples, limits, model traits).
- [ ] Add quickstart + troubleshooting for Venice (API key setup, rate limits, web search/characters, structured outputs).
- [ ] Include release notes and migration notes for deprecated models/endpoints (per sources of truth).
