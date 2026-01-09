# OpenCode Project Context

## Project Overview

OpenCode is an open-source AI coding agent designed to provide development assistance through a terminal user interface (TUI). It serves as a flexible, provider-agnostic AI coding partner that can work with various LLM providers including Claude, OpenAI, Google, and Venice AI. The project emphasizes TUI-first design, LSP support, and a modular agent system.

## Architecture & Structure

The project is organized as a TypeScript monorepo with the following key components:

- `packages/opencode`: Core business logic and server
- `packages/opencode/src/cli/cmd/tui/`: TUI code written in SolidJS with opentui
- `packages/app`: Shared web UI components written in SolidJS
- `packages/desktop`: Native desktop app built with Tauri
- `packages/plugin`: Plugin system source code
- `packages/console`: Console-related functionality
- `packages/sdk`: SDK implementations
- `packages/ui`: UI components
- `packages/util`: Utility functions

## Technologies Used

- **Language**: TypeScript
- **Package Manager**: Bun (1.3+)
- **Build System**: Turborepo
- **UI Framework**: SolidJS
- **Desktop**: Tauri
- **Infrastructure**: SST (with Cloudflare provider)
- **Nix**: For reproducible environments

## Development Setup

### Prerequisites
- Bun 1.3+ installed

### Installation
```bash
bun install
```

### Running the Development Server
From the repository root:
```bash
bun dev
```

To run against a specific directory:
```bash
bun dev <directory>
```

To run against the root of the repo:
```bash
bun dev .
```

### Running Different Components

Web App:
```bash
bun run --cwd packages/app dev
```

Desktop App:
```bash
bun run --cwd packages/desktop tauri dev
```

## Building

To compile a standalone executable:
```bash
./packages/opencode/script/build.ts --single
```

Then run it with:
```bash
./packages/opencode/dist/opencode-<platform>/bin/opencode
```

## Available Commands

The project uses a CLI system with various commands:

- `run`: Execute a command
- `generate`: Generate code
- `auth`: Authentication management
- `agent`: Agent management
- `upgrade`: Upgrade OpenCode
- `uninstall`: Uninstall OpenCode
- `models`: List available models
- `serve`: Start the server
- `web`: Web interface commands
- `stats`: Statistics
- `github`: GitHub integration
- `pr`: Pull request commands
- `session`: Session management
- And more...

## Agent System

OpenCode includes two built-in agents:

- **build**: Default, full access agent for development work
- **plan**: Read-only agent for analysis and code exploration (denies file edits by default, asks permission before running bash commands)

Additionally, there's a **general** subagent for complex searches and multistep tasks, invoked using `@general` in messages.

## Provider Integration

The project is designed to be provider-agnostic and supports multiple AI providers:
- Anthropic (Claude)
- OpenAI
- Google
- Azure
- Amazon Bedrock
- Mistral
- Groq
- Together AI
- And more, including custom providers like Venice AI

## Development Conventions

### Style Guide
- Keep logic within a single function unless breaking it out adds clear reuse or composition benefits
- Avoid unnecessary destructuring of variables
- Avoid `else` statements
- Prefer `.catch(...)` instead of `try`/`catch` when possible
- Use precise types and avoid `any`
- Stick to immutable patterns and avoid `let`
- Choose concise single-word identifiers when they remain descriptive
- Use Bun APIs where possible (e.g., `Bun.file()`)

### Pull Request Expectations
- All PRs must reference an existing issue
- Keep pull requests small and focused
- Follow conventional commit standards for titles:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation changes
  - `chore:` maintenance tasks
  - `refactor:` code refactoring
  - `test:` adding or updating tests

## File Structure

The project follows a monorepo structure with packages in the `packages/` directory. Key files include:

- `package.json`: Root configuration with workspaces and scripts
- `tsconfig.json`: TypeScript configuration extending @tsconfig/bun
- `turbo.json`: Turborepo configuration
- `bunfig.toml`: Bun configuration
- `sst.config.ts`: SST infrastructure configuration
- `README.md`: Main project documentation
- `CONTRIBUTING.md`: Contribution guidelines
- `STYLE_GUIDE.md`: Style guide

## Testing

The project uses Bun's built-in test runner. Individual packages may have their own test commands.

## Debugging

For debugging OpenCode:
- Use `bun run --inspect=<url> dev ...` and attach your debugger via that URL
- For server debugging: `bun run --inspect=ws://localhost:6499/ ./src/index.ts serve --port 4096`
- For TUI debugging: `bun run --inspect=ws://localhost:6499/ --conditions=browser ./src/index.ts`

## Venice AI Integration

The project can be extended to work with Venice AI by configuring it as a provider with:
- Base URL: `https://api.venice.ai/api/v1`
- API key stored in `VENICE_API_KEY` environment variable
- Model selection based on Venice's model traits

## Key Dependencies

Major dependencies include:
- `@ai-sdk/*`: Various AI provider SDKs
- `hono`: Web framework
- `solid-js`: UI framework
- `@opentui/*`: TUI components
- `zod`: Schema validation
- `yargs`: CLI parsing
- `chokidar`: File watching
- `tree-sitter-*`: Syntax parsing

## Environment Variables

Common environment variables used:
- `VENICE_API_KEY`: Venice AI API key
- `OPENCODE_INSTALL_DIR`: Custom installation directory
- `XDG_BIN_DIR`: XDG Base Directory Specification path
- `AGENT`: Set to "1" in runtime
- `OPENCODE`: Set to "1" in runtime

## Infrastructure

The project uses SST for cloud infrastructure deployment, configured to use Cloudflare as the home provider. The infrastructure is defined in the `infra/` directory with different stacks for app, console, and enterprise features.