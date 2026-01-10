/**
 * Slash Commands for OpenCode Venice
 * 
 * Provides CLI slash commands for tool execution and Venice-specific features
 */
import { Log } from "../util/log"
import { VeniceProvider } from "../provider/venice"
import { VeniceTools } from "../tool/venice-tools"

const log = Log.create({ service: "slash-commands" })

export namespace SlashCommands {
    /**
     * Slash command definition
     */
    export interface Command {
        name: string
        description: string
        usage: string
        execute: (args: string[], context: CommandContext) => Promise<CommandResult>
    }

    /**
     * Context passed to commands
     */
    export interface CommandContext {
        apiKey?: string
        sessionId?: string
        projectDir?: string
    }

    /**
     * Result of command execution
     */
    export interface CommandResult {
        success: boolean
        output: string
        data?: unknown
    }

    /**
     * Parse a slash command from user input
     */
    export function parse(input: string): { command: string; args: string[] } | null {
        const trimmed = input.trim()
        if (!trimmed.startsWith("/")) return null

        const parts = trimmed.slice(1).split(/\s+/)
        const command = parts[0]?.toLowerCase()
        const args = parts.slice(1)

        return command ? { command, args } : null
    }

    /**
     * Registry of available commands
     */
    const commands = new Map<string, Command>()

    /**
     * /tools - List available tools
     */
    commands.set("tools", {
        name: "tools",
        description: "List available tools",
        usage: "/tools",
        execute: async () => {
            const toolList = [
                "read     - Read file contents",
                "write    - Write or create files",
                "edit     - Edit existing files",
                "bash     - Execute shell commands",
                "websearch - Search the web",
                "webfetch  - Fetch URL content",
            ]
            return {
                success: true,
                output: `Available tools:\n${toolList.map(t => `  ${t}`).join("\n")}`,
                data: toolList,
            }
        },
    })

    /**
     * /use <tool> <args> - Execute a tool directly
     */
    commands.set("use", {
        name: "use",
        description: "Execute a tool directly",
        usage: "/use <tool> <args...>",
        execute: async (args, context) => {
            if (args.length < 1) {
                return { success: false, output: "Usage: /use <tool> <args...>" }
            }

            const toolName = args[0]
            const toolArgs = args.slice(1).join(" ")

            try {
                const result = await VeniceTools.VeniceToolExecutor.executeTool(
                    toolName,
                    { input: toolArgs },
                    context
                )
                return {
                    success: true,
                    output: `Tool ${toolName} executed:\n${JSON.stringify(result, null, 2)}`,
                    data: result,
                }
            } catch (error) {
                return {
                    success: false,
                    output: `Error executing ${toolName}: ${String(error)}`,
                }
            }
        },
    })

    /**
     * /character <name> - Select Venice character
     */
    commands.set("character", {
        name: "character",
        description: "Select a Venice AI character",
        usage: "/character [name]",
        execute: async (args, context) => {
            const apiKey = context.apiKey || process.env.VENICE_API_KEY

            if (!args[0]) {
                // List available characters
                const characters = await VeniceProvider.fetchCharacters(apiKey)
                if (!characters?.characters) {
                    return { success: false, output: "Unable to fetch characters" }
                }
                const charList = characters.characters.map(c => `  ${c.slug} - ${c.name}`).join("\n")
                return {
                    success: true,
                    output: `Available characters:\n${charList}`,
                    data: characters.characters,
                }
            }

            // Select character
            const characterSlug = args[0]
            return {
                success: true,
                output: `Character selected: ${characterSlug}\nThe assistant will now respond as this character.`,
                data: { character: characterSlug },
            }
        },
    })

    /**
     * /websearch <query> - Search the web
     */
    commands.set("websearch", {
        name: "websearch",
        description: "Search the web using Venice AI",
        usage: "/websearch <query>",
        execute: async (args) => {
            if (args.length === 0) {
                return { success: false, output: "Usage: /websearch <query>" }
            }

            const query = args.join(" ")
            // The actual web search would be done through the Venice model with web search enabled
            return {
                success: true,
                output: `Web search for: "${query}"\nNote: Web search is performed by Venice models with web_search capability enabled.`,
                data: { query, instruction: "Enable web_search in your Venice model configuration" },
            }
        },
    })

    /**
     * /venice - Show Venice status and toggle features
     */
    commands.set("venice", {
        name: "venice",
        description: "Show Venice AI status and features",
        usage: "/venice [feature]",
        execute: async (_args, context) => {
            const apiKey = context.apiKey || process.env.VENICE_API_KEY

            if (!apiKey) {
                return {
                    success: false,
                    output: "VENICE_API_KEY not set. Please configure your Venice API key.",
                }
            }

            const health = await VeniceProvider.checkHealth(apiKey)
            const capabilities = await VeniceProvider.fetchCapabilities(apiKey)

            const status = [
                `Venice API Status: ${health.status}`,
                `Response Time: ${health.responseTime}ms`,
                `Available Models: ${capabilities?.models?.length ?? 0}`,
                "",
                "Features:",
                "  - Uncensored mode: Available",
                "  - Characters: Available",
                "  - Web Search: Available (model-dependent)",
                "  - Structured Outputs: Available",
            ]

            return {
                success: true,
                output: status.join("\n"),
                data: { health, modelCount: capabilities?.models?.length },
            }
        },
    })

    /**
     * /help - Show available commands
     */
    commands.set("help", {
        name: "help",
        description: "Show available slash commands",
        usage: "/help",
        execute: async () => {
            const helpText = Array.from(commands.values())
                .map(cmd => `  /${cmd.name.padEnd(12)} - ${cmd.description}`)
                .join("\n")

            return {
                success: true,
                output: `Available slash commands:\n${helpText}\n\nUse /help <command> for detailed usage.`,
            }
        },
    })

    /**
     * Execute a slash command
     */
    export async function execute(
        input: string,
        context: CommandContext = {}
    ): Promise<CommandResult> {
        const parsed = parse(input)
        if (!parsed) {
            return { success: false, output: "Invalid command format. Use /help for available commands." }
        }

        const command = commands.get(parsed.command)
        if (!command) {
            return { success: false, output: `Unknown command: /${parsed.command}. Use /help for available commands.` }
        }

        log.info(`Executing slash command: /${parsed.command}`, { args: parsed.args })
        return command.execute(parsed.args, context)
    }

    /**
     * Get all registered commands
     */
    export function getCommands(): Command[] {
        return Array.from(commands.values())
    }

    /**
     * Register a custom command
     */
    export function register(command: Command): void {
        commands.set(command.name.toLowerCase(), command)
        log.info(`Registered slash command: /${command.name}`)
    }
}
