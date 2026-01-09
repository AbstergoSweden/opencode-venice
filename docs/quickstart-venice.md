# Venice AI Quickstart Guide

Get started with the Venice AI provider in OpenCode in just a few steps.

## Prerequisites

- OpenCode installed and working
- A Venice AI API key from [Venice AI](https://venice.ai)

## Step 1: Set Up Your API Key

First, you'll need to set your Venice API key as an environment variable:

```bash
export VENICE_API_KEY=your_actual_api_key_here
```

Alternatively, you can add it to your OpenCode configuration file (`~/.opencode/config.json`):

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

## Step 2: Verify Provider Availability

Check that the Venice provider is available:

```bash
opencode auth list
```

You should see Venice listed among the available providers.

## Step 3: Test the Connection

Test that you can connect to Venice:

```bash
opencode models --provider venice
```

This should list the available Venice models.

## Step 4: Start Using Venice

Now you can use Venice models in your OpenCode sessions:

```bash
# Start a new session using Venice
opencode --model venice/venice-uncensored

# Or specify Venice in your session
opencode
# Then in the TUI, select the Venice provider and model
```

## Step 5: Use Advanced Features

### Character-Based Interactions

Use Venice's character feature to customize the AI's personality:

1. In the TUI, look for character selection options
2. Or use the API directly with character parameters

### Tool Usage

Venice supports tool usage just like other providers. You can use bash, file operations, and other tools based on your permissions:

```
/execute echo "Hello from Venice!"
```

### Structured Outputs

For structured responses, you can use the standard OpenCode interface which will leverage Venice's structured output capabilities.

## Troubleshooting

### API Key Issues

If you get authentication errors:

1. Double-check your API key is correct
2. Verify the environment variable is set in your current shell
3. Make sure you're using the correct environment (development vs production)

### Model Not Found

If Venice models aren't showing up:

1. Verify the provider is enabled in your config
2. Check that your API key has access to the models you're requesting

### Rate Limits

If you hit rate limits:

- The system has built-in retry logic that will automatically retry requests
- Wait before making additional requests if you continue to receive rate limit errors

### TypeScript Errors

If you encounter type errors in Venice integration:

1. Ensure `@ai-sdk/openai-compatible` is installed
2. Run `npm run typecheck` to identify specific issues
3. Clear turbo cache if needed: `bun turbo typecheck --force`

### Health Check

Verify Venice provider is working:

```bash
# Run Venice provider tests
cd packages/opencode && bun test test/provider/venice.test.ts

# Check if provider loads correctly
VENICE_API_KEY=your-key bun dev
```

## Next Steps

- Explore different Venice models to find the one that best fits your needs
- Try using character-based interactions for specialized tasks
- Experiment with tool usage for complex operations
- Check out the full documentation for advanced features
