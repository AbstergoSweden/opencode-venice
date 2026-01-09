# OpenCode Project Context

## Project Overview
OpenCode is an open-source AI coding agent, designed to be a provider-agnostic alternative to tools like Claude Code. It features a client/server architecture supporting multiple clients including a TUI (Terminal User Interface), a Web UI, and a Native Desktop App.

**Core Philosophy:**
- **Provider Agnostic:** Works with OpenAI, Claude, Google, local models, etc.
- **Client/Server:** The core logic runs as a server, controllable by various clients (local TUI, remote mobile app, etc.).
- **TUI Focus:** Built by Neovim users, heavily optimized for terminal usage.

## Architecture & Structure
This is a monorepo managed with **Turborepo** and **Bun**.

### Key Workspaces
- **`packages/opencode`**: The core business logic and server. Includes the TUI (built with SolidJS + `opentui`).
- **`packages/app`**: Shared web UI components (SolidJS).
- **`packages/desktop`**: Native desktop application (Tauri + Rust) that wraps the web UI.
- **`packages/console`**: Cloud/Platform console application (SolidStart + SST).
- **`packages/plugin`**: Source for the `@opencode-ai/plugin` system.
- **`packages/sdk`**: Source for the `@opencode-ai/sdk`.

## Tech Stack
- **Runtime & Package Manager:** [Bun](https://bun.sh/) (v1.3+)
- **Build System:** Turborepo
- **Frontend Framework:** SolidJS (TUI & Web), SolidStart (Console)
- **Styling:** TailwindCSS
- **Infrastructure:** SST (Serverless Stack)
- **Desktop:** Tauri (Rust)

## Building and Running

**Prerequisites:**
- Bun v1.3+ is required.

### Install Dependencies
```bash
bun install
```

### Development Commands

**Core & TUI:**
Runs the OpenCode server and TUI.
```bash
bun dev                # Runs in packages/opencode
bun dev <directory>    # Runs against a specific directory
bun dev .              # Runs against the root of the repo
```

**Web App:**
Starts the local dev server for the web UI (http://localhost:5173).
```bash
bun run --cwd packages/app dev
```

**Desktop App:**
Starts the native Tauri app.
```bash
bun run --cwd packages/desktop tauri dev # With native window
bun run --cwd packages/desktop dev       # Web dev server only
```

**Build Standalone Executable:**
```bash
./packages/opencode/script/build.ts --single
```

## Development Conventions

### Coding Style
- **Functional Style:** Prefer functional patterns over classes. Keep logic in single functions unless composition/reuse is clear.
- **Immutability:** Avoid `let`; stick to `const`.
- **Destructuring:** **AVOID** unnecessary destructuring. Use `obj.a` instead of `const { a } = obj` to preserve context.
- **Control Flow:** Avoid `else` statements. Avoid `try/catch` blocks; prefer `.catch(...)`.
- **Typing:** Strict types. **AVOID** `any`.
- **Naming:** Prefer concise single-word identifiers if descriptive.
- **Runtime:** Use Bun APIs (e.g., `Bun.file()`) wherever possible.

### Git & Contribution
- **Issues:** All PRs must link to an existing issue.
- **Commits:** Use [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`, `chore:`, `docs:`).
  - Scope is optional: `feat(app): ...`
- **UI Changes:** PRs with UI changes must include screenshots/videos.

## Debugging
- **Bun Debugging:** Use `bun run --inspect=<url> dev ...` and attach via Chrome DevTools or VSCode.
- **Spawn Mode:** If breakpoints in server code aren't hitting, try `bun dev spawn`.
- **Manual Attach:**
  1. Server: `bun run --inspect=ws://localhost:6499/ ./src/index.ts serve --port 4096`
  2. TUI: `opencode attach http://localhost:4096`
