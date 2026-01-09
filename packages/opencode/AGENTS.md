# opencode agent guidelines

## Build/Test Commands

- **Install**: `bun install`
- **Run**: `bun run --conditions=browser ./src/index.ts`
- **Typecheck**: `bun run typecheck` (npm run typecheck)
- **Test**: `bun test` (runs all tests)
- **Single test**: `bun test test/tool/tool.test.ts` (specific test file)

## Code Style

- **Runtime**: Bun with TypeScript ESM modules
- **Imports**: Use relative imports for local modules, named imports preferred
- **Types**: Zod schemas for validation, TypeScript interfaces for structure
- **Naming**: camelCase for variables/functions, PascalCase for classes/namespaces
- **Error handling**: Use Result patterns, avoid throwing exceptions in tools
- **File structure**: Namespace-based organization (e.g., `Tool.define()`, `Session.create()`)

## Architecture

- **Tools**: Implement `Tool.Info` interface with `execute()` method
- **Context**: Pass `sessionID` in tool context, use `App.provide()` for DI
- **Validation**: All inputs validated with Zod schemas
- **Logging**: Use `Log.create({ service: "name" })` pattern
- **Storage**: Use `Storage` namespace for persistence
- **API Client**: The TypeScript TUI (built with SolidJS + OpenTUI) communicates with the OpenCode server using `@opencode-ai/sdk`. When adding/modifying server endpoints in `packages/opencode/src/server/server.ts`, run `./script/generate.ts` to regenerate the SDK and related files.

## Venice Provider

The Venice AI provider (`src/provider/venice.ts`) integrates OpenCode with Venice.ai's API.

### Configuration

- **Environment**: Set `VENICE_API_KEY` in your environment
- **Registry**: Venice provider is registered in `src/provider/provider.ts` under `CUSTOM_LOADERS`

### Features

- **Capability caching** - Fetches and caches model capabilities from `/models` endpoint
- **Character support** - Use `VeniceProvider.getVeniceModelWithCharacter(modelId, apiKey, characterSlug)` for character personas
- **Retry logic** - Exponential backoff with jitter for rate limit handling
- **Streaming** - Use `VeniceProvider.getVeniceModelWithStreaming()` for streaming responses
- **Structured outputs** - Use `VeniceProvider.getVeniceModelWithStructuredOutput()` for JSON schema outputs

### Usage

```typescript
import { VeniceProvider } from "../provider/venice"

// Basic model
const model = VeniceProvider.getVeniceModel("qwen-2.5-72b", apiKey)

// With character
const model = VeniceProvider.getVeniceModelWithCharacter("qwen-2.5-72b", apiKey, "aria")

// Check capabilities
const hasTools = await VeniceProvider.hasCapability("qwen-2.5-72b", "tool_call", apiKey)
```

### Testing

```bash
bun test test/provider/venice.test.ts  # 17 tests
```
