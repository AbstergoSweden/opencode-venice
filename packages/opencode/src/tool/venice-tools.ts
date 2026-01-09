import { Tool } from "./tool"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Truncate } from "./truncation"
import { BashTool } from "./bash"
import { EditTool } from "./edit"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { WebSearchTool } from "./websearch"
import { WebFetchTool } from "./webfetch"
import z from "zod"
import path from "path"

export namespace VeniceTools {
  const log = Log.create({ service: "venice-tools" })

  /**
   * Venice-specific tool execution wrapper that enforces permission gates
   */
  export class VeniceToolExecutor {
    private static readonly ALLOWED_TOOLS = new Set([
      "bash",
      "read",
      "write",
      "edit",
      "websearch",
      "webfetch",
      "glob",
      "grep",
      "ls"
    ])

    /**
     * Execute a tool call with Venice-specific permission checks
     */
    static async executeTool(
      toolName: string,
      toolArguments: any,
      context: any
    ): Promise<any> {
      log.info("Executing Venice tool", { toolName, toolArguments })

      // Check if the tool is allowed for Venice
      if (!this.ALLOWED_TOOLS.has(toolName)) {
        throw new Error(`Tool '${toolName}' is not permitted for Venice provider`)
      }

      // Apply Venice-specific permission checks
      await this.checkVenicePermissions(toolName, toolArguments, context)

      // Execute the tool based on its type
      switch (toolName) {
        case "bash":
          return await this.executeBashTool(toolArguments, context)
        case "read":
          return await this.executeReadTool(toolArguments, context)
        case "write":
          return await this.executeWriteTool(toolArguments, context)
        case "edit":
          return await this.executeEditTool(toolArguments, context)
        case "websearch":
          return await this.executeWebSearchTool(toolArguments, context)
        case "webfetch":
          return await this.executeWebFetchTool(toolArguments, context)
        default:
          // For other tools, delegate to the standard tool registry
          return await this.executeGenericTool(toolName, toolArguments, context)
      }
    }

    /**
     * Check Venice-specific permissions for a tool
     */
    private static async checkVenicePermissions(
      toolName: string,
      toolArguments: any,
      context: any
    ): Promise<void> {
      // Check if Venice provider is allowed to execute this type of tool
      const config = await context.getConfig()
      const veniceConfig = config.provider?.["venice"] || {}

      // Check if specific tool is enabled for Venice
      if (veniceConfig.tools && Array.isArray(veniceConfig.tools) && !veniceConfig.tools.includes(toolName)) {
        throw new Error(`Tool '${toolName}' is not enabled for Venice provider in configuration`)
      }

      // Apply additional permission checks based on tool type
      switch (toolName) {
        case "bash":
          // For bash tools, check if the command is allowed
          await this.checkBashPermission(toolArguments, context)
          break
        case "read":
        case "write":
        case "edit":
          // For file operations, check if the path is within allowed directories
          await this.checkFileOperationPermission(toolName, toolArguments, context)
          break
        case "websearch":
        case "webfetch":
          // For web tools, check if web access is enabled
          if (veniceConfig.web_access === false) {
            throw new Error(`Web access is disabled for Venice provider`)
          }
          break
      }
    }

    /**
     * Check permissions for bash commands
     */
    private static async checkBashPermission(
      args: any,
      context: any
    ): Promise<void> {
      const command = args.command?.toLowerCase() || ""

      // Block dangerous commands
      const dangerousCommands = [
        "rm -rf /",
        "rm -rf /*",
        "dd ",
        "mkfs.",
        "format ",
        "shutdown",
        "reboot",
        "poweroff",
        "halt",
        "kill -9 1",
        ">:",
        ">/dev/null"
      ]

      for (const dangerousCmd of dangerousCommands) {
        if (command.includes(dangerousCmd)) {
          throw new Error(`Dangerous command blocked: ${dangerousCmd}`)
        }
      }

      // Check if command is in allowed list if specified
      const config = await context.getConfig()
      const allowedCommands = config.provider?.["venice"]?.allowed_commands
      if (allowedCommands && Array.isArray(allowedCommands) && allowedCommands.length > 0) {
        const commandParts = command.split(" ")
        const baseCommand = commandParts[0]
        if (!allowedCommands.includes(baseCommand)) {
          throw new Error(`Command '${baseCommand}' is not in the allowed list for Venice provider`)
        }
      }
    }

    /**
     * Check permissions for file operations
     */
    private static async checkFileOperationPermission(
      toolName: string,
      args: any,
      context: any
    ): Promise<void> {
      let filePath: string | undefined

      if (toolName === "read") {
        filePath = args.path
      } else if (toolName === "write" || toolName === "edit") {
        filePath = args.path
      }

      if (!filePath) {
        return
      }

      // Resolve the path to absolute
      const absolutePath = path.resolve(Instance.directory, filePath)

      // Check if the path is within the project directory
      if (!Filesystem.contains(Instance.directory, absolutePath)) {
        const config = await context.getConfig()
        const allowedPaths = config.provider?.["venice"]?.allowed_paths || []

        // Check if the path is in the allowed paths
        const isInAllowedPath = allowedPaths.some((allowedPath: string) =>
          Filesystem.contains(path.resolve(Instance.directory, allowedPath), absolutePath)
        )

        if (!isInAllowedPath) {
          throw new Error(`File operation on path '${filePath}' is not allowed for Venice provider`)
        }
      }
    }

    /**
     * Execute bash tool with Venice-specific security
     */
    private static async executeBashTool(args: any, context: any) {
      // Use the existing BashTool but with Venice-specific security checks
      return await BashTool.init().then(tool =>
        tool.execute(args, {
          ...context,
          ask: async (permissionReq: any) => {
            // Apply Venice-specific permission logic
            log.info("Checking Venice bash permission", permissionReq)
            // In a real implementation, this would check Venice-specific permissions
            return context.ask(permissionReq)
          }
        })
      )
    }

    /**
     * Execute read tool with Venice-specific security
     */
    private static async executeReadTool(args: any, context: any) {
      return await ReadTool.init().then(tool => tool.execute(args, context))
    }

    /**
     * Execute write tool with Venice-specific security
     */
    private static async executeWriteTool(args: any, context: any) {
      return await WriteTool.init().then(tool => tool.execute(args, context))
    }

    /**
     * Execute edit tool with Venice-specific security
     */
    private static async executeEditTool(args: any, context: any) {
      return await EditTool.init().then(tool => tool.execute(args, context))
    }

    /**
     * Execute web search tool with Venice-specific security
     */
    private static async executeWebSearchTool(args: any, context: any) {
      return await WebSearchTool.init().then(tool => tool.execute(args, context))
    }

    /**
     * Execute web fetch tool with Venice-specific security
     */
    private static async executeWebFetchTool(args: any, context: any) {
      return await WebFetchTool.init().then(tool => tool.execute(args, context))
    }

    /**
     * Execute generic tool
     */
    private static async executeGenericTool(toolName: string, args: any, context: any) {
      // This would delegate to the standard tool registry
      // For now, we'll throw an error since we only handle specific tools
      throw new Error(`Generic tool execution not implemented for Venice: ${toolName}`)
    }
  }

  /**
   * Venice-specific tool definition for handling tool calls from Venice AI
   */
  export const VeniceToolCallHandler = Tool.define("venice_tool_call", async () => {
    return {
      description: "Internal tool for handling tool calls from Venice AI provider",
      parameters: z.object({
        tool_name: z.string().describe("Name of the tool to execute"),
        tool_arguments: z.record(z.string(), z.any()).describe("Arguments for the tool"),
        tool_id: z.string().describe("Unique ID for this tool call")
      }),
      async execute(params: { tool_name: string; tool_arguments: Record<string, any>; tool_id: string }, ctx: any): Promise<{
        title: string
        output: string
        metadata: { tool_id: string; tool_name: string; result: any }
      }> {
        try {
          const result = await VeniceToolExecutor.executeTool(
            params.tool_name,
            params.tool_arguments,
            ctx
          )

          return {
            title: `Venice tool call result for ${params.tool_name}`,
            output: typeof result === 'string' ? result : (result?.output || JSON.stringify(result)),
            metadata: {
              tool_id: params.tool_id,
              tool_name: params.tool_name,
              result: result
            }
          }
        } catch (error) {
          log.error("Error executing Venice tool", {
            tool_name: params.tool_name,
            error: (error as Error).message
          })

          return {
            title: `Error executing Venice tool: ${params.tool_name}`,
            output: `Error: ${(error as Error).message}`,
            metadata: {
              tool_id: params.tool_id,
              tool_name: params.tool_name,
              result: { error: (error as Error).message }
            }
          }
        }
      }
    }
  })
}