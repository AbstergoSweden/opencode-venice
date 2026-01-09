# Venice AI Provider Integration

This document explains how to use the Venice AI provider integration in OpenCode.

## Overview

The Venice AI provider allows you to use Venice's language models with OpenCode. Venice offers unique models with special capabilities like uncensored responses, character-based interactions, and more.

## Configuration

### Setting up API Key

To use the Venice provider, you need to set your Venice API key:

```bash
export VENICE_API_KEY=your_api_key_here
```

Or add it to your OpenCode configuration file (`~/.opencode/config.json`):

```json
{
  "provider": {
    "venice": {
      "options": {
        "apiKey": "your_api_key_here"
      }
    }
  }
}
```

## Available Models

The Venice provider includes several models:

- `venice-uncensored` - An uncensored model for unrestricted conversations
- Other models as they become available

## Features

### Character Selection

Venice supports character-based interactions. You can select from various characters to customize the AI's personality and behavior:

```typescript
import { VeniceProvider } from '@opencode-ai/venice'

// Fetch available characters
const characters = await VeniceProvider.fetchCharacters()

// Use a specific character
const model = await VeniceProvider.getVeniceModelWithCharacter(
  'venice-uncensored',
  'alan-watts' // character slug
)
```

### Structured Outputs

The Venice provider supports structured outputs using JSON schemas:

```typescript
// The provider supports structured outputs via the standard AI SDK interface
const result = await streamText({
  model: veniceModel,
  schema: MySchema,
  // ... other options
})
```

### Tool Calling

The Venice provider supports function calling and tool execution with proper permission gates:

- Tool calls are subject to the same permission system as other providers
- The plan agent will restrict certain operations
- All tool executions are logged and traced

### Streaming

Streaming is supported for real-time responses:

```typescript
const result = await streamText({
  model: veniceModel,
  // ... other options
})

for await (const delta of result.textStream) {
  process.stdout.write(delta)
}
```

### Multimodal Support

The Venice provider supports multimodal inputs (images, audio, video):

```typescript
import { VeniceProvider } from '@opencode-ai/venice'

const multimodalContent = VeniceProvider.prepareMultimodalContent([
  {
    type: 'text',
    text: 'What do you see in this image?'
  },
  {
    type: 'image_url',
    image_url: {
      url: 'https://example.com/image.jpg'
    }
  }
])
```

## Error Handling and Retries

The Venice provider includes robust error handling:

- Automatic retries for server errors (5xx)
- Rate limit handling with exponential backoff
- Network error recovery
- Graceful degradation when API is unavailable

## Health Checks

You can check the status of the Venice API:

```typescript
import { VeniceProvider } from '@opencode-ai/venice'

const health = await VeniceProvider.checkHealth(process.env.VENICE_API_KEY)
console.log(health.status) // 'healthy', 'unhealthy', or 'degraded'
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure your `VENICE_API_KEY` is set correctly
2. **Rate Limits**: The provider includes automatic retry logic for rate limits
3. **Model Unavailability**: Check if the requested model is available in Venice's API

### Debug Logging

Enable debug logging to troubleshoot issues:

```bash
export OPENCODE_DEBUG_LOGGING=true
```

This will provide detailed logs of API requests and responses (excluding sensitive data).