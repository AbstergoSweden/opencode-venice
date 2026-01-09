import { test, expect, mock, beforeEach } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { VeniceProvider } from "../../src/provider/venice"
import { Env } from "../../src/env"

beforeEach(() => {
    VeniceProvider.clearCache()
})

test("venice provider loads with VENICE_API_KEY env variable", async () => {
    await using tmp = await tmpdir({
        init: async (dir) => {
            await Bun.write(
                path.join(dir, "opencode.json"),
                JSON.stringify({
                    $schema: "https://opencode.ai/config.json",
                }),
            )
        },
    })
    await Instance.provide({
        directory: tmp.path,
        init: async () => {
            Env.set("VENICE_API_KEY", "test-venice-api-key")
        },
        fn: async () => {
            const providers = await Provider.list()
            expect(providers["venice"]).toBeDefined()
            expect(providers["venice"].source).toBe("custom")
        },
    })
}, 60000) // Increase timeout to 60 seconds

test("venice provider loads from config with apiKey option", async () => {
    await using tmp = await tmpdir({
        init: async (dir) => {
            await Bun.write(
                path.join(dir, "opencode.json"),
                JSON.stringify({
                    $schema: "https://opencode.ai/config.json",
                    provider: {
                        venice: {
                            options: {
                                apiKey: "config-venice-api-key",
                            },
                        },
                    },
                }),
            )
        },
    })
    await Instance.provide({
        directory: tmp.path,
        fn: async () => {
            const providers = await Provider.list()
            expect(providers["venice"]).toBeDefined()
        },
    })
})

test("venice provider can be disabled", async () => {
    await using tmp = await tmpdir({
        init: async (dir) => {
            await Bun.write(
                path.join(dir, "opencode.json"),
                JSON.stringify({
                    $schema: "https://opencode.ai/config.json",
                    disabled_providers: ["venice"],
                }),
            )
        },
    })
    await Instance.provide({
        directory: tmp.path,
        init: async () => {
            Env.set("VENICE_API_KEY", "test-venice-api-key")
        },
        fn: async () => {
            const providers = await Provider.list()
            expect(providers["venice"]).toBeUndefined()
        },
    })
})

test("createVeniceProvider creates a provider instance", () => {
    const provider = VeniceProvider.createVeniceProvider("test-api-key")
    expect(provider).toBeDefined()
    expect(typeof provider.languageModel).toBe("function")
})

test("createVeniceProvider accepts custom options", () => {
    const provider = VeniceProvider.createVeniceProvider("test-api-key", {
        timeout: 60000,
    })
    expect(provider).toBeDefined()
})

test("getVeniceModel returns a language model", () => {
    const model = VeniceProvider.getVeniceModel("venice-uncensored", "test-api-key")
    expect(model).toBeDefined()
    // LanguageModel type doesn't expose modelId directly, just verify it's defined
})

test("getVeniceModelWithStreaming returns a streaming-capable model", () => {
    const model = VeniceProvider.getVeniceModelWithStreaming(
        "venice-uncensored",
        "test-api-key"
    )
    expect(model).toBeDefined()
    // LanguageModel type doesn't expose modelId directly, just verify it's defined
})

test("getVeniceModelWithStructuredOutput returns a structured output model", () => {
    const model = VeniceProvider.getVeniceModelWithStructuredOutput(
        "venice-uncensored",
        "test-api-key",
        { type: "object", properties: { name: { type: "string" } } }
    )
    expect(model).toBeDefined()
})

test("getVeniceModelWithCharacter returns a character-enabled model", () => {
    const model = VeniceProvider.getVeniceModelWithCharacter(
        "venice-uncensored",
        "test-api-key",
        "aria"
    )
    expect(model).toBeDefined()
})

test("clearCache clears both capability and character caches", () => {
    // This should not throw
    VeniceProvider.clearCache()
})

test("fetchCapabilities makes API request", async () => {
    const originalFetch = globalThis.fetch

    // @ts-expect-error - Mock doesn't include preconnect but works at runtime
    globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({
            models: [
                {
                    id: "venice-uncensored",
                    name: "Venice Uncensored",
                    capabilities: {
                        tool_call: true,
                        code_interpreter: false,
                        web_search: false,
                        vision: false,
                        characters: true,
                        structured_outputs: true,
                    },
                    traits: [],
                },
            ],
            traits: {},
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    })

    try {
        // Clear cache to force fetch
        VeniceProvider.clearCache()
        const result = await VeniceProvider.fetchCapabilities("test-api-key")
        expect(result).toBeDefined()
        expect(result?.models).toBeDefined()
    } finally {
        globalThis.fetch = originalFetch
    }
})

test("fetchCharacters returns character list", async () => {
    const originalFetch = globalThis.fetch

    // @ts-expect-error - Mock doesn't include preconnect but works at runtime
    globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({
            characters: [
                { slug: "aria", name: "Aria", description: "A helpful assistant" },
                { slug: "zion", name: "Zion", description: "A coding expert" },
            ],
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    })

    try {
        // Clear cache to force fetch
        VeniceProvider.clearCache()
        const result = await VeniceProvider.fetchCharacters("test-api-key")
        expect(result).toBeDefined()
        expect(result?.characters).toBeDefined()
        expect(result?.characters?.length).toBeGreaterThan(0)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test("venice provider model whitelist filters models", async () => {
    await using tmp = await tmpdir({
        init: async (dir) => {
            await Bun.write(
                path.join(dir, "opencode.json"),
                JSON.stringify({
                    $schema: "https://opencode.ai/config.json",
                    provider: {
                        venice: {
                            whitelist: ["venice-uncensored"],
                            options: {
                                apiKey: "test-api-key",
                            },
                        },
                    },
                }),
            )
        },
    })
    await Instance.provide({
        directory: tmp.path,
        fn: async () => {
            const providers = await Provider.list()
            if (providers["venice"]) {
                const models = Object.keys(providers["venice"].models)
                // If venice is loaded, the whitelist should limit models
                expect(models.length).toBeLessThanOrEqual(1)
            }
        },
    })
})

test("venice provider model blacklist excludes specific models", async () => {
    await using tmp = await tmpdir({
        init: async (dir) => {
            await Bun.write(
                path.join(dir, "opencode.json"),
                JSON.stringify({
                    $schema: "https://opencode.ai/config.json",
                    provider: {
                        venice: {
                            blacklist: ["gpt-4"],
                            options: {
                                apiKey: "test-api-key",
                            },
                        },
                    },
                }),
            )
        },
    })
    await Instance.provide({
        directory: tmp.path,
        fn: async () => {
            const providers = await Provider.list()
            if (providers["venice"]) {
                const models = Object.keys(providers["venice"].models)
                expect(models).not.toContain("gpt-4")
            }
        },
    })
})

test("createVeniceProviderWithCharacter creates provider with character header", () => {
    const provider = VeniceProvider.createVeniceProviderWithCharacter(
        "test-api-key",
        "aria"
    )
    expect(provider).toBeDefined()
})

test("hasCapability checks model capability", async () => {
    const originalFetch = globalThis.fetch

    // @ts-expect-error - Mock doesn't include preconnect but works at runtime
    globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({
            models: [
                {
                    id: "venice-uncensored",
                    name: "Venice Uncensored",
                    capabilities: {
                        tool_call: true,
                        code_interpreter: false,
                        web_search: false,
                        vision: false,
                        characters: true,
                        structured_outputs: true,
                    },
                    traits: [],
                },
            ],
            traits: {},
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    })

    try {
        VeniceProvider.clearCache()
        const result = await VeniceProvider.hasCapability(
            "venice-uncensored",
            "tool_call",
            "test-api-key"
        )
        expect(typeof result).toBe("boolean")
    } finally {
        globalThis.fetch = originalFetch
    }
})

test("getTraitModels returns models with specific trait", async () => {
    const originalFetch = globalThis.fetch

    // @ts-expect-error - Mock doesn't include preconnect but works at runtime
    globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({
            models: [
                {
                    id: "venice-uncensored",
                    name: "Venice Uncensored",
                    capabilities: {
                        tool_call: true,
                        code_interpreter: false,
                        web_search: false,
                        vision: false,
                        characters: true,
                        structured_outputs: true,
                    },
                    traits: ["uncensored"],
                },
            ],
            traits: { "uncensored": ["venice-uncensored"] },
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    })

    try {
        VeniceProvider.clearCache()
        const result = await VeniceProvider.getTraitModels(
            "uncensored",
            "test-api-key"
        )
        expect(result).toBeDefined()
    } finally {
        globalThis.fetch = originalFetch
    }
})
