import { TaskTool } from "@/tool/task"
import { Session } from "."
import { MessageV2 } from "./message-v2"
import { Identifier } from "../id/id"
import { Instance } from "../project/instance"
import { Plugin } from "../plugin"
import { Agent } from "../agent/agent"
import { Tool } from "@/tool/tool"
import { PermissionNext } from "@/permission/next"
import { Log } from "../util/log"
import { ulid } from "ulid"
import type { Provider } from "../provider/provider"

const log = Log.create({ service: "session.invoke" })

export async function invokeSubtask(input: {
  sessionID: string
  parentID: string
  task: Pick<MessageV2.SubtaskPart, "agent" | "prompt" | "description" | "command">
  model: Provider.Model
  abort: AbortSignal
}) {
  const { sessionID, parentID, task, model, abort } = input
  const session = await Session.get(sessionID)

  const taskTool = await TaskTool.init()
  const assistantMessage = (await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "assistant",
    parentID: parentID,
    sessionID,
    mode: task.agent,
    agent: task.agent,
    path: {
      cwd: Instance.directory,
      root: Instance.worktree,
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: model.id,
    providerID: model.providerID,
    time: {
      created: Date.now(),
    },
  })) as MessageV2.Assistant
  let part = (await Session.updatePart({
    id: Identifier.ascending("part"),
    messageID: assistantMessage.id,
    sessionID: assistantMessage.sessionID,
    type: "tool",
    callID: ulid(),
    tool: TaskTool.id,
    state: {
      status: "running",
      input: {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      },
      time: {
        start: Date.now(),
      },
    },
  })) as MessageV2.ToolPart
  const taskArgs = {
    prompt: task.prompt,
    description: task.description,
    subagent_type: task.agent,
    command: task.command,
  }
  await Plugin.trigger(
    "tool.execute.before",
    {
      tool: "task",
      sessionID,
      callID: part.id,
    },
    { args: taskArgs },
  )
  let executionError: Error | undefined
  const taskAgent = await Agent.get(task.agent)
  const taskCtx: Tool.Context = {
    agent: task.agent,
    messageID: assistantMessage.id,
    sessionID: sessionID,
    abort,
    callID: part.callID,
    extra: { bypassAgentCheck: true },
    async metadata(input) {
      await Session.updatePart({
        ...part,
        type: "tool",
        state: {
          ...part.state,
          ...input,
        },
      } satisfies MessageV2.ToolPart)
    },
    async ask(req) {
      await PermissionNext.ask({
        ...req,
        sessionID: sessionID,
        ruleset: PermissionNext.merge(taskAgent.permission, session.permission ?? []),
      })
    },
  }
  const result = await taskTool.execute(taskArgs, taskCtx).catch((error) => {
    executionError = error
    log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
    return undefined
  })
  await Plugin.trigger(
    "tool.execute.after",
    {
      tool: "task",
      sessionID,
      callID: part.id,
    },
    result,
  )
  assistantMessage.finish = "tool-calls"
  assistantMessage.time.completed = Date.now()
  await Session.updateMessage(assistantMessage)
  if (result && part.state.status === "running") {
    await Session.updatePart({
      ...part,
      state: {
        status: "completed",
        input: part.state.input,
        title: result.title,
        metadata: result.metadata,
        output: result.output,
        attachments: result.attachments,
        time: {
          ...part.state.time,
          end: Date.now(),
        },
      },
    } satisfies MessageV2.ToolPart)
  }
  if (!result) {
    await Session.updatePart({
      ...part,
      state: {
        status: "error",
        error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
        time: {
          start: part.state.status === "running" ? part.state.time.start : Date.now(),
          end: Date.now(),
        },
        metadata: part.state.metadata,
        input: part.state.input,
      },
    } satisfies MessageV2.ToolPart)
  }
}
