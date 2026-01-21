import { ulid } from "ulid"
import { Tool } from "./tool"
import { Session } from "../session"
import { Identifier } from "../id/id"
import { MessageV2 } from "../session/message-v2"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Plugin } from "../plugin"
import { Agent } from "@/agent/agent"
import { PermissionNext } from "@/permission/next"

const log = Log.create({ service: "tool" })

export type InvokeToolInput<T> = {
  tool: Tool.Untyped<T>
  agent: Agent.Info
  sessionID: string
  parentID: string
  args: T
  abort: AbortSignal
  bypass?: {
    permission?: boolean
  }
}

export async function invoke<T>(input: InvokeToolInput<T>) {
  const assistantMessage = (await Session.updateMessage({
    id: Identifier.ascending("message"),
    role: "assistant",
    parentID: input.parentID,
    sessionID: input.sessionID,
    mode: input.agent.name,
    agent: input.agent.name,
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
    modelID: input.agent.model?.modelID ?? "",
    providerID: input.agent.model?.providerID ?? "",
    time: {
      created: Date.now(),
    },
  })) as MessageV2.Assistant
  const part = (await Session.updatePart({
    id: Identifier.ascending("part"),
    messageID: assistantMessage.id,
    sessionID: assistantMessage.sessionID,
    type: "tool",
    callID: ulid(),
    tool: input.tool.id,
    state: {
      status: "running",
      input: input.args,
      time: {
        start: Date.now(),
      },
    },
  })) as MessageV2.ToolPart
  await Plugin.trigger(
    "tool.execute.before",
    {
      tool: input.tool.id,
      sessionID: input.sessionID,
      callID: part.id,
    },
    { args: input.args },
  )
  let executionError: Error | undefined
  const session = await Session.get(input.sessionID)
  const taskCtx: Tool.Context = {
    agent: input.agent.name,
    messageID: assistantMessage.id,
    sessionID: input.sessionID,
    abort: input.abort,
    callID: part.callID,
    extra: { bypassAgentCheck: input.bypass?.permission },
    async metadata(val) {
      await Session.updatePart({
        ...part,
        type: "tool",
        state: {
          ...part.state,
          ...val,
        },
      } satisfies MessageV2.ToolPart)
    },
    async ask(req) {
      await PermissionNext.ask({
        ...req,
        sessionID: input.sessionID,
        ruleset: PermissionNext.merge(input.agent.permission, session.permission ?? []),
      })
    },
  }
  const result = await input.tool.execute(input.args, taskCtx).catch((error) => {
    executionError = error
    log.error("tool execution failed", {
      error,
      agent: input.agent.name,
    })
    return undefined
  })
  await Plugin.trigger(
    "tool.execute.after",
    {
      tool: input.tool.id,
      sessionID: input.sessionID,
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
        metadata: part.metadata,
        input: part.state.input,
      },
    } satisfies MessageV2.ToolPart)
  }

  // Add synthetic user message to prevent certain reasoning models from erroring
  // If we create assistant messages w/ out user ones following mid loop thinking signatures
  // will be missing and it can cause errors for models like gemini for example
  const summaryUserMsg: MessageV2.User = {
    id: Identifier.ascending("message"),
    sessionID: input.sessionID,
    role: "user",
    time: {
      created: Date.now(),
    },
    agent: input.agent.name,
    model: {
      modelID: input.agent.model?.modelID ?? "",
      providerID: input.agent.model?.providerID ?? "",
    },
  }
  await Session.updateMessage(summaryUserMsg)
  await Session.updatePart({
    id: Identifier.ascending("part"),
    messageID: summaryUserMsg.id,
    sessionID: input.sessionID,
    type: "text",
    text: "Summarize the tool output above and continue with your task.",
    synthetic: true,
  } satisfies MessageV2.TextPart)
  return {
    message: assistantMessage,
    part,
    result,
  }
}
