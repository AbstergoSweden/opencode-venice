import { Agent } from "@/agent/agent"
import { invoke } from "@/tool/invoke"
import { Tool } from "@/tool/tool"
import { MessageV2 } from "./message-v2"

export async function invokeTool(
  lastUser: MessageV2.User,
  part: MessageV2.SubtaskPart,
  abort: AbortSignal,
) {
  const taskTool = await Tool.get("task")
  if (!taskTool) throw new Error("Task tool not found")
  const agent = await Agent.get(part.agent)
  return await invoke({
    tool: taskTool,
    agent,
    sessionID: lastUser.sessionID,
    parentID: lastUser.id,
    args: {
      prompt: part.prompt,
      description: part.description,
      subagent_type: part.agent,
      command: part.command,
    },
    abort: abort,
    bypass: {
      permission: true,
    },
  })
}
