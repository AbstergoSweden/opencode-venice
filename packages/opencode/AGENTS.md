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
- **Config file**: Add to `opencode.json`:
  ```json
  {
    "provider": {
      "venice": {
        "options": {
          "apiKey": "your-api-key"
        }
      }
    }
  }
  ```

### Features

- **Capability caching** - Fetches and caches model capabilities from `/models` endpoint (5 min TTL)
- **Character support** - Use `VeniceProvider.getVeniceModelWithCharacter(modelId, characterSlug, apiKey)` for character personas
- **Retry logic** - Exponential backoff with jitter for rate limit handling (max 3 retries)
- **Streaming** - Use `VeniceProvider.getVeniceModelWithStreaming()` for streaming responses
- **Structured outputs** - Use `VeniceProvider.getVeniceModelWithStructuredOutput()` for JSON schema outputs
- **Health checks** - Use `VeniceProvider.checkHealth()` or `getVeniceStatus()` for API health monitoring
- **Multimodal** - Image generation, upscaling, editing via `generateImage()`, `upscaleImage()`, `editImage()`
- **Embeddings** - Generate embeddings via `generateEmbeddings()`

### Rate Limits

Venice applies rate limits per API tier. The provider handles 429 responses with automatic retry:
- Initial delay: 1 second
- Max delay: 30 seconds
- Respects `Retry-After` header when present

### Usage

```typescript
import { VeniceProvider } from "../provider/venice"

// Basic model
const model = VeniceProvider.getVeniceModel("llama-3.3-70b", apiKey)

// With character persona
const model = await VeniceProvider.getVeniceModelWithCharacter(
  "llama-3.3-70b",
  "aria",  // character slug
  apiKey
)

// Check model capabilities
const hasTools = await VeniceProvider.hasCapability("llama-3.3-70b", "tool_call", apiKey)
const hasVision = await VeniceProvider.hasCapability("llama-3.3-70b", "vision", apiKey)

// List available characters
const characters = await VeniceProvider.fetchCharacters(apiKey)

// Health check
const status = await VeniceProvider.getVeniceStatus(apiKey)
if (status.status !== 'healthy') {
  console.warn('Venice API may be degraded:', status.message)
}

// Image generation
const result = await VeniceProvider.generateImage({
  model: "flux-dev",
  prompt: "A cyberpunk cityscape at sunset",
  resolution: "2K"
}, apiKey)
```

### Venice CLI

A standalone CLI chat interface is available at `src/cli/venice-cli.ts`:

```bash
# Start the Venice CLI
bun run venice-cli

# Available commands:
/model [id]        - Switch/show current model
/character [slug]  - Switch to a Venice character persona
/list-characters   - List available characters
/stream            - Toggle streaming output
/status            - Check Venice API status
/help              - Show all commands
```

### Tool Execution

Venice tool calls are handled by `VeniceTools.VeniceToolExecutor` which enforces:
- Allowed tool whitelist (bash, read, write, edit, websearch, etc.)
- Agent permission ruleset integration (respects plan=read-only)
- File path containment to project directory
- Dangerous command blocking

### Testing

```bash
# Unit tests (mocked)
bun test test/provider/venice.test.ts  # 17 tests

# Integration tests (requires VENICE_API_KEY)
VENICE_API_KEY=xxx bun test test/provider/venice-integration.test.ts
```

### Sources of Truth

Refer to Venice documentation for API details:
- https://docs.venice.ai/overview/getting-started
- https://docs.venice.ai/api-reference/endpoint/chat/completions
- https://docs.venice.ai/api-reference/rate-limiting
- https://docs.venice.ai/models/text
