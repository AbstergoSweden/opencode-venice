import { createInterface } from 'readline'
import { createReadStream, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Provider } from '../provider/provider'
import { Config } from '../config/config'
import { Log } from '../util/log'
import { Instance } from '../project/instance'
import { VeniceProvider } from '../provider/venice'

export namespace VeniceCLI {
  const log = Log.create({ service: 'venice-cli' })

  interface ChatHistory {
    timestamp: number
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
      timestamp: number
    }>
  }

  interface CLIConfig {
    defaultModel: string
    defaultProvider: string
    historyFile: string
    maxHistoryLength: number
  }

  class VeniceChatSession {
    private history: ChatHistory
    private config: CLIConfig
    private currentModel: string
    private currentProvider: string
    private currentCharacter: string | undefined
    private streamingEnabled: boolean = true

    constructor(config: CLIConfig) {
      this.config = config
      this.currentModel = config.defaultModel
      this.currentProvider = config.defaultProvider
      this.history = this.loadHistory()
    }

    private loadHistory(): ChatHistory {
      if (existsSync(this.config.historyFile)) {
        try {
          const data = readFileSync(this.config.historyFile, 'utf8')
          const parsed = JSON.parse(data) as ChatHistory
          // Limit history length
          if (parsed.messages.length > this.config.maxHistoryLength) {
            parsed.messages = parsed.messages.slice(-this.config.maxHistoryLength)
          }
          return parsed
        } catch (error) {
          log.warn('Failed to load chat history, starting fresh', { error })
          return { timestamp: Date.now(), messages: [] }
        }
      }
      return { timestamp: Date.now(), messages: [] }
    }

    private saveHistory() {
      try {
        writeFileSync(this.config.historyFile, JSON.stringify(this.history, null, 2))
      } catch (error) {
        log.error('Failed to save chat history', { error })
      }
    }

    async switchAgent(agentName: string) {
      // In a real implementation, this would switch between different agent configurations
      console.log(`Switching to agent: ${agentName}`)
      // For now, we'll just log the switch
    }

    async switchCharacter(characterSlug: string | undefined) {
      if (!characterSlug) {
        this.currentCharacter = undefined
        console.log('Character cleared - using default persona')
        return
      }

      try {
        // Validate the character exists
        const character = await VeniceProvider.getCharacter(characterSlug)
        if (character) {
          this.currentCharacter = characterSlug
          console.log(`Switched to character: ${character.name} (${characterSlug})`)
        } else {
          console.error(`Character '${characterSlug}' not found`)
        }
      } catch (error) {
        console.error(`Error switching character: ${(error as Error).message}`)
      }
    }

    toggleStreaming(): boolean {
      this.streamingEnabled = !this.streamingEnabled
      return this.streamingEnabled
    }

    async switchModel(modelId: string) {
      try {
        // Validate that the model exists
        const model = await Provider.getModel(this.currentProvider, modelId)
        this.currentModel = modelId
        console.log(`Switched to model: ${modelId}`)
      } catch (error) {
        console.error(`Error switching to model ${modelId}:`, error)
        console.log(`Model ${modelId} not available. Current model remains: ${this.currentModel}`)
      }
    }

    async switchProvider(providerId: string) {
      try {
        // Validate that the provider exists
        const provider = await Provider.getProvider(providerId)
        if (provider) {
          this.currentProvider = providerId
          console.log(`Switched to provider: ${providerId}`)
          // Update model to a default one for this provider if needed
          if (provider.models && Object.keys(provider.models).length > 0) {
            const defaultModel = Object.keys(provider.models)[0]
            await this.switchModel(defaultModel)
          }
        } else {
          console.error(`Provider ${providerId} not available`)
        }
      } catch (error) {
        console.error(`Error switching to provider ${providerId}:`, error)
      }
    }

    async addMessage(role: 'user' | 'assistant', content: string) {
      this.history.messages.push({
        role,
        content,
        timestamp: Date.now()
      })

      // Limit history length
      if (this.history.messages.length > this.config.maxHistoryLength) {
        this.history.messages = this.history.messages.slice(-this.config.maxHistoryLength)
      }

      this.saveHistory()
    }

    getHistory(): ChatHistory {
      return { ...this.history }
    }

    async processUserInput(input: string): Promise<string> {
      // Check for special commands
      if (input.startsWith('/')) {
        return await this.handleCommand(input.slice(1))
      }

      // Add user message to history
      await this.addMessage('user', input)

      try {
        // Get the Venice provider and model - use character-aware model if set
        let languageModel
        if (this.currentCharacter && this.currentProvider === 'venice') {
          languageModel = await VeniceProvider.getVeniceModelWithCharacter(
            this.currentModel,
            this.currentCharacter
          )
        } else {
          const veniceModel = await Provider.getModel(this.currentProvider, this.currentModel)
          languageModel = await Provider.getLanguage(veniceModel)
        }

        // Prepare messages for the API call
        const messages = [
          ...this.history.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        ]

        // Call the Venice model using the streamText function from the ai SDK
        const { streamText } = await import('ai')
        const result = await streamText({
          model: languageModel,
          messages: messages as any, // Type assertion to avoid complex type issues
        })

        let fullResponse = ''

        // Stream the response in real-time
        if (this.streamingEnabled) {
          for await (const chunk of result.textStream) {
            process.stdout.write(chunk)
            fullResponse += chunk
          }
          process.stdout.write('\n') // Add newline after streaming completes
        } else {
          fullResponse = await result.text
        }

        // Add assistant response to history
        await this.addMessage('assistant', fullResponse)

        return this.streamingEnabled ? '' : fullResponse // Return empty if streamed (already printed)
      } catch (error) {
        const errorMessage = `Error processing request: ${(error as Error).message}`
        await this.addMessage('assistant', errorMessage)
        return errorMessage
      }
    }

    private async handleCommand(command: string): Promise<string> {
      const [cmd, ...args] = command.trim().split(' ')

      switch (cmd.toLowerCase()) {
        case 'help':
          return this.getHelp()
        case 'model':
          if (args.length > 0) {
            await this.switchModel(args[0])
            return `Model switched to: ${args[0]}`
          }
          return `Current model: ${this.currentModel}`
        case 'provider':
          if (args.length > 0) {
            await this.switchProvider(args[0])
            return `Provider switched to: ${args[0]}`
          }
          return `Current provider: ${this.currentProvider}`
        case 'agent':
          if (args.length > 0) {
            await this.switchAgent(args[0])
            return `Agent switched to: ${args[0]}`
          }
          return 'Agent switching functionality is available'
        case 'history':
          return `Chat history has ${this.history.messages.length} messages`
        case 'clear':
          this.history.messages = []
          this.saveHistory()
          return 'Chat history cleared'
        case 'list-models':
          return await this.listModels()
        case 'character':
          if (args.length > 0) {
            if (args[0] === 'none' || args[0] === 'clear') {
              await this.switchCharacter(undefined)
              return 'Character cleared'
            }
            await this.switchCharacter(args[0])
            return `Character switched to: ${args[0]}`
          }
          return `Current character: ${this.currentCharacter || 'none'}`
        case 'list-characters':
          return await this.listCharacters()
        case 'stream':
          const enabled = this.toggleStreaming()
          return `Streaming ${enabled ? 'enabled' : 'disabled'}`
        case 'status':
          return await this.getVeniceStatus()
        case 'exit':
        case 'quit':
          process.exit(0)
        default:
          return `Unknown command: /${cmd}. Type /help for available commands.`
      }
    }

    private getHelp(): string {
      return `
Available commands:
  /help - Show this help message
  /model [model_id] - Switch to a specific model or show current model
  /provider [provider_id] - Switch to a specific provider or show current provider
  /agent [agent_name] - Switch to a specific agent
  /character [slug|none] - Switch to a Venice character or clear
  /list-characters - List available Venice characters
  /stream - Toggle streaming output on/off
  /status - Check Venice API status
  /history - Show chat history stats
  /clear - Clear chat history
  /list-models - List available models for current provider
  /exit or /quit - Exit the CLI
      `.trim()
    }

    private async listModels(): Promise<string> {
      try {
        const provider = await Provider.getProvider(this.currentProvider)
        if (provider) {
          const models = Object.keys(provider.models)
          if (models.length > 0) {
            return `Available models for ${this.currentProvider}:\n${models.join('\n')}`
          } else {
            return `No models available for provider: ${this.currentProvider}`
          }
        } else {
          return `Provider ${this.currentProvider} not found`
        }
      } catch (error) {
        return `Error listing models: ${(error as Error).message}`
      }
    }

    private async listCharacters(): Promise<string> {
      try {
        const characters = await VeniceProvider.fetchCharacters()
        if (characters.characters && characters.characters.length > 0) {
          const charList = characters.characters
            .map(c => `  ${c.slug} - ${c.name}${c.description ? `: ${c.description}` : ''}`)
            .join('\n')
          return `Available Venice characters:\n${charList}`
        } else {
          return 'No Venice characters available'
        }
      } catch (error) {
        return `Error listing characters: ${(error as Error).message}`
      }
    }

    private async getVeniceStatus(): Promise<string> {
      try {
        const status = await VeniceProvider.getVeniceStatus()
        const lines = [
          `Venice API Status: ${status.status}`,
          `Response time: ${status.responseTime}ms`,
        ]
        if (status.details) {
          lines.push(`API Reachable: ${status.details.apiReachable ? 'Yes' : 'No'}`)
          if (status.details.rateLimitStatus) {
            lines.push(`Rate Limit Remaining: ${status.details.rateLimitStatus}`)
          }
        }
        if (status.message) {
          lines.push(`Message: ${status.message}`)
        }
        return lines.join('\n')
      } catch (error) {
        return `Error checking Venice status: ${(error as Error).message}`
      }
    }
  }

  export async function startVeniceCLI() {
    console.log('Starting Venice AI CLI...')
    console.log('Type your message or use /help for commands')
    console.log('')

    // Set up default configuration
    const config: CLIConfig = {
      defaultModel: 'venice-uncensored', // Default Venice model
      defaultProvider: 'venice',
      historyFile: join(homedir(), '.opencode', 'venice-cli-history.json'),
      maxHistoryLength: 50
    }

    // Create the chat session
    const session = new VeniceChatSession(config)

    // Create readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    })

    // Handle each line of input
    rl.on('line', async (input) => {
      const trimmedInput = input.trim()
      if (!trimmedInput) return

      try {
        const response = await session.processUserInput(trimmedInput)
        console.log(response)
        console.log('') // Add a blank line for readability
      } catch (error) {
        console.error('Error processing input:', error)
      }

      // Reprompt
      rl.prompt()
    })

    // Initial prompt
    rl.setPrompt('> ')
    rl.prompt()

    // Handle exit
    rl.on('close', () => {
      console.log('\nGoodbye!')
      process.exit(0)
    })

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\nGoodbye!')
      process.exit(0)
    })
  }
}