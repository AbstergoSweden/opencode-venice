import { describe, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session removal benchmark", () => {
  test("benchmark remove session with many messages", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.create({})
        const messageCount = 50
        const partsPerMessage = 10

        console.log(`Creating ${messageCount} messages with ${partsPerMessage} parts each...`)

        for (let i = 0; i < messageCount; i++) {
            const messageID = Identifier.ascending("message")
            await Session.updateMessage({
                id: messageID,
                sessionID: session.id,
                role: "user",
                time: { created: Date.now() },
                agent: "test-agent",
                model: { providerID: "test", modelID: "test" }
            })

            for (let j = 0; j < partsPerMessage; j++) {
                await Session.updatePart({
                    id: Identifier.ascending("part"),
                    sessionID: session.id,
                    messageID: messageID,
                    type: "text",
                    text: "test",
                    time: { start: Date.now() }
                })
            }
        }

        console.log("Starting removal...")
        const start = performance.now()
        await Session.remove(session.id)
        const end = performance.now()
        console.log(`Removal took: ${(end - start).toFixed(2)}ms`)
      },
    })
  }, 120000)
})
