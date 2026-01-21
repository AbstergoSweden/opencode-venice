import { Agent } from "@/agent/agent"
import { invoke } from "@/tool/invoke"
import { TaskTool } from "@/tool/task"
import { MessageV2 } from "./message-v2"

export async function invokeTool(
  lastUser: MessageV2.User,
  part: MessageV2.SubtaskPart,
  abort: AbortSignal,
) {
  const taskTool = await TaskTool.init()
  const agent = await Agent.get(part.agent)
  return invoke({
    tool: taskTool,
    agent,
    lastUser,
    sessionID: lastUser.sessionID,
    parentID: lastUser.id,
    args: {
      prompt: part.prompt,
      description: part.description,
      subagent_type: part.agent,
      command: part.command,
    },
    abort,
    bypass: {
      permission: true,
    },
  })
}
