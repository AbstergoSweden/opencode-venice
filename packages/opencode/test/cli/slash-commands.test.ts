/**
 * Slash Commands Unit Tests
 */
import { test, expect, describe } from "bun:test"
import { SlashCommands } from "../../src/cli/slash-commands"

describe("SlashCommands", () => {
    describe("parse", () => {
        test("parses valid slash command", () => {
            const result = SlashCommands.parse("/tools")
            expect(result).toEqual({ command: "tools", args: [] })
        })

        test("parses command with arguments", () => {
            const result = SlashCommands.parse("/use read file.ts")
            expect(result).toEqual({ command: "use", args: ["read", "file.ts"] })
        })

        test("parses command with multiple arguments", () => {
            const result = SlashCommands.parse("/websearch how to use typescript")
            expect(result).toEqual({ command: "websearch", args: ["how", "to", "use", "typescript"] })
        })

        test("returns null for non-slash input", () => {
            const result = SlashCommands.parse("hello world")
            expect(result).toBeNull()
        })

        test("returns null for empty slash", () => {
            const result = SlashCommands.parse("/")
            expect(result).toBeNull()
        })

        test("handles extra whitespace", () => {
            const result = SlashCommands.parse("  /tools  arg1   arg2  ")
            expect(result).toEqual({ command: "tools", args: ["arg1", "arg2"] })
        })
    })

    describe("getCommands", () => {
        test("returns array of commands", () => {
            const commands = SlashCommands.getCommands()
            expect(Array.isArray(commands)).toBe(true)
            expect(commands.length).toBeGreaterThan(0)
        })

        test("includes expected commands", () => {
            const commands = SlashCommands.getCommands()
            const names = commands.map(c => c.name)

            expect(names).toContain("tools")
            expect(names).toContain("use")
            expect(names).toContain("character")
            expect(names).toContain("websearch")
            expect(names).toContain("venice")
            expect(names).toContain("help")
        })
    })

    describe("execute", () => {
        test("/tools returns tool list", async () => {
            const result = await SlashCommands.execute("/tools")
            expect(result.success).toBe(true)
            expect(result.output).toContain("Available tools")
            expect(result.output).toContain("read")
            expect(result.output).toContain("write")
        })

        test("/help returns command list", async () => {
            const result = await SlashCommands.execute("/help")
            expect(result.success).toBe(true)
            expect(result.output).toContain("Available slash commands")
            expect(result.output).toContain("/tools")
        })

        test("/websearch without query returns usage", async () => {
            const result = await SlashCommands.execute("/websearch")
            expect(result.success).toBe(false)
            expect(result.output).toContain("Usage")
        })

        test("/use without tool returns usage", async () => {
            const result = await SlashCommands.execute("/use")
            expect(result.success).toBe(false)
            expect(result.output).toContain("Usage")
        })

        test("unknown command returns error", async () => {
            const result = await SlashCommands.execute("/unknowncommand")
            expect(result.success).toBe(false)
            expect(result.output).toContain("Unknown command")
        })

        test("invalid format returns error", async () => {
            const result = await SlashCommands.execute("not a command")
            expect(result.success).toBe(false)
            expect(result.output).toContain("Invalid command format")
        })
    })

    describe("register", () => {
        test("can register custom command", async () => {
            SlashCommands.register({
                name: "testcmd",
                description: "Test command",
                usage: "/testcmd",
                execute: async () => ({ success: true, output: "test output" }),
            })

            const result = await SlashCommands.execute("/testcmd")
            expect(result.success).toBe(true)
            expect(result.output).toBe("test output")
        })
    })
})
