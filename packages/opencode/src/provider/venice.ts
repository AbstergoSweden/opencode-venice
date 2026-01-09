import { createOpenaiCompatible } from "./sdk/openai-compatible/src"
import type { LanguageModelV2 } from "ai"
import { Log } from "../util/log"

export namespace VeniceProvider {
  const log = Log.create({ service: "venice-provider" })
  // Venice API configuration
  const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1"

  // Capability cache to avoid repeated API calls
  const capabilityCache = new Map<string, any>()
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  // Rate limiting configuration
  const MAX_RETRIES = 3
  const INITIAL_RETRY_DELAY = 1000 // 1 second
  const MAX_RETRY_DELAY = 30000 // 30 seconds
  const JITTER_FACTOR = 0.1 // 10% jitter

  interface VeniceCapabilities {
    models: Array<{
      id: string
      name: string
      capabilities: {
        tool_call: boolean
        code_interpreter: boolean
        web_search: boolean
        vision: boolean
        characters: boolean
        structured_outputs: boolean
      }
      traits: string[]
    }>
    traits: Record<string, string[]> // trait name to model IDs mapping
  }

  /**
   * Exponential backoff with jitter for retry mechanism
   */
  function calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY)
    const jitter = Math.random() * JITTER_FACTOR * exponentialDelay
    return exponentialDelay + jitter
  }

  /**
   * Generic fetch with retry mechanism and error handling
   */
  async function fetchWithRetry(url: string, options: RequestInit, maxRetries = MAX_RETRIES) {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: options.signal || AbortSignal.timeout(30000), // 30 second timeout
        })

        // Check if the response indicates a rate limit
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : calculateRetryDelay(attempt)

          if (attempt < maxRetries) {
            console.warn(`Rate limited. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // Check for other server errors that might be retriable
        if (response.status >= 500 && response.status < 600) {
          if (attempt < maxRetries) {
            const delay = calculateRetryDelay(attempt)
            console.warn(`Server error ${response.status}. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // For client errors (4xx), don't retry unless it's a specific case
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          // Don't retry client errors except for rate limiting
          return response
        }

        return response
      } catch (error) {
        lastError = error as Error

        // If it's a timeout or network error, retry if attempts remain
        if (attempt < maxRetries) {
          const delay = calculateRetryDelay(attempt)
          console.warn(`Network error: ${(error as Error).message}. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // If we've exhausted retries, throw the error
        throw error
      }
    }

    // This should not be reached due to the return statements above, but added for completeness
    throw lastError || new Error("Unknown error during fetch")
  }

  /**
   * Fetch capabilities from Venice API endpoints with error handling and retry logic
   */
  export async function fetchCapabilities(apiKey?: string): Promise<VeniceCapabilities> {
    const cacheKey = "venice_capabilities"
    const cached = capabilityCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      // Fetch models information with retry logic
      const modelsResponse = await fetchWithRetry(`${DEFAULT_BASE_URL}/models`, {
        headers,
      })

      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch Venice models: ${modelsResponse.status} ${modelsResponse.statusText}`)
      }

      const modelsData = await modelsResponse.json()

      // Fetch traits information with retry logic
      const traitsResponse = await fetchWithRetry(`${DEFAULT_BASE_URL}/models/traits`, {
        headers,
      })

      if (!traitsResponse.ok) {
        console.warn(`Failed to fetch Venice traits: ${traitsResponse.status} ${traitsResponse.statusText}`)
        // Continue with models data even if traits fail
      }

      const traitsData = traitsResponse.ok ? await traitsResponse.json() : {}

      const capabilities: VeniceCapabilities = {
        models: modelsData.data?.map((model: any) => ({
          id: model.id,
          name: model.name || model.id,
          capabilities: {
            tool_call: model.capabilities?.includes("tool_call") || model.supports_tools || false,
            code_interpreter: model.capabilities?.includes("code_interpreter") || false,
            web_search: model.capabilities?.includes("web_search") || false,
            vision: model.capabilities?.includes("vision") || model.supports_images || false,
            characters: model.capabilities?.includes("characters") || false,
            structured_outputs: model.capabilities?.includes("structured_outputs") || model.supports_structured_outputs || false,
          },
          traits: model.traits || [],
        })) || [],
        traits: traitsData.traits || {},
      }

      // Cache the result
      capabilityCache.set(cacheKey, {
        data: capabilities,
        timestamp: Date.now(),
      })

      return capabilities
    } catch (error) {
      console.error("Error fetching Venice capabilities:", error)
      // Return empty capabilities if fetch fails, but log the error
      return {
        models: [],
        traits: {},
      }
    }
  }

  /**
   * Get models that have specific traits
   */
  export async function getTraitModels(trait: string, apiKey?: string) {
    const capabilities = await fetchCapabilities(apiKey)
    return capabilities.traits[trait] || []
  }

  /**
   * Check if a model has a specific capability
   */
  export async function hasCapability(modelId: string, capability: string, apiKey?: string) {
    const capabilities = await fetchCapabilities(apiKey)
    const model = capabilities.models.find(m => m.id === modelId)
    return model?.capabilities[capability as keyof typeof model.capabilities] || false
  }

  /**
   * Create a Venice provider instance with error handling and retry configuration
   */
  export function createVeniceProvider(apiKey?: string, options: Record<string, any> = {}) {
    return createOpenaiCompatible({
      apiKey,
      baseURL: DEFAULT_BASE_URL,
      name: "venice",
      // Add custom fetch with retry logic
      fetch: async (input: any, init?: any) => {
        // Apply retry logic to individual requests
        return fetchWithRetry(input, init || {}).then(response => response)
      },
      ...options,
    })
  }

  /**
   * Create a Venice provider instance with streaming support
   */
  export function createVeniceProviderWithStreaming(apiKey?: string, options: Record<string, any> = {}) {
    return createOpenaiCompatible({
      apiKey,
      baseURL: DEFAULT_BASE_URL,
      name: "venice",
      // Add custom fetch with retry logic and streaming support
      fetch: async (input: any, init?: any) => {
        // Apply retry logic to individual requests
        return fetchWithRetry(input, init || {}).then(response => response)
      },
      ...options,
    })
  }

  /**
   * Enhanced Venice provider with structured response support
   */
  export function createVeniceProviderWithStructuredOutputs(apiKey?: string, options: Record<string, any> = {}) {
    // The OpenAI compatible provider already supports structured outputs via response_format
    // Venice should work with the standard approach
    return createOpenaiCompatible({
      apiKey,
      baseURL: DEFAULT_BASE_URL,
      name: "venice",
      // Add custom fetch with retry logic
      fetch: async (input: any, init?: any) => {
        // Apply retry logic to individual requests
        return fetchWithRetry(input, init || {}).then(response => response)
      },
      ...options,
    })
  }

  /**
   * Get a Venice language model
   */
  export function getVeniceModel(modelId: string, apiKey?: string, options: Record<string, any> = {}) {
    const veniceProvider = createVeniceProvider(apiKey, options)
    return veniceProvider.languageModel(modelId) as LanguageModelV2
  }

  /**
   * Get a Venice language model with structured output support
   * This function ensures the model is properly configured for structured outputs
   */
  export async function getVeniceModelWithStructuredOutput(
    modelId: string,
    apiKey?: string,
    options: Record<string, any> = {}
  ) {
    const capabilities = await fetchCapabilities(apiKey)
    const model = capabilities.models.find(m => m.id === modelId)

    if (!model) {
      throw new Error(`Model ${modelId} not found in Venice capabilities`)
    }

    if (!model.capabilities.structured_outputs) {
      console.warn(`Model ${modelId} may not support structured outputs based on Venice capabilities`)
    }

    const veniceProvider = createVeniceProviderWithStructuredOutputs(apiKey, options)
    return veniceProvider.languageModel(modelId) as LanguageModelV2
  }

  /**
   * Process streaming response from Venice API
   * Handles Server-Sent Events (SSE) parsing for Venice streaming endpoints
   */
  export async function* processVeniceStream(
    response: Response,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string, void, unknown> {
    if (!response.body) {
      throw new Error("Response body is empty")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            yield buffer.trim()
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Split by newlines to process each SSE event
        const lines = buffer.split(/\r?\n/)

        // Keep the last partial line in the buffer
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6) // Remove "data: " prefix

            if (data === "[DONE]") {
              // Stream is complete
              break
            }

            try {
              // Parse the JSON data
              const parsed = JSON.parse(data)

              // Extract the content based on Venice's response format
              let content = ""
              if (parsed.choices && parsed.choices[0]) {
                if (parsed.choices[0].delta?.content) {
                  content = parsed.choices[0].delta.content
                } else if (parsed.choices[0].text) {
                  content = parsed.choices[0].text
                }
              } else if (parsed.content) {
                content = parsed.content
              }

              if (content) {
                yield content
                if (onChunk) {
                  onChunk(content)
                }
              }
            } catch (e) {
              // Skip malformed JSON lines
              console.warn("Skipping malformed SSE data:", data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Get a Venice language model with streaming support
   */
  export function getVeniceModelWithStreaming(
    modelId: string,
    apiKey?: string,
    options: Record<string, any> = {}
  ) {
    const veniceProvider = createVeniceProviderWithStreaming(apiKey, options)
    return veniceProvider.languageModel(modelId) as LanguageModelV2
  }

  /**
   * Multimodal support interfaces
   */
  export interface VeniceImageInput {
    type: 'image_url'
    image_url: {
      url: string
      detail?: 'low' | 'high'
    }
  }

  export interface VeniceTextInput {
    type: 'text'
    text: string
  }

  export interface VeniceAudioInput {
    type: 'audio'
    audio: {
      url: string
      format: string // e.g., 'wav', 'mp3', 'm4a'
    }
  }

  export interface VeniceVideoInput {
    type: 'video'
    video: {
      url: string
      format: string // e.g., 'mp4', 'mov', 'avi'
    }
  }

  export type VeniceMultimodalContent =
    | VeniceTextInput
    | VeniceImageInput
    | VeniceAudioInput
    | VeniceVideoInput

  /**
   * Prepare multimodal content for Venice API
   * Converts various input types to Venice-compatible format
   */
  export function prepareMultimodalContent(content: VeniceMultimodalContent[]): any[] {
    return content.map(item => {
      switch (item.type) {
        case 'text':
          return {
            type: 'text',
            text: item.text
          }
        case 'image_url':
          return {
            type: 'image_url',
            image_url: {
              url: item.image_url.url,
              detail: item.image_url.detail || 'auto'
            }
          }
        case 'audio':
          // Venice may convert audio to text internally or process directly
          return {
            type: 'audio_url',
            audio_url: {
              url: item.audio.url,
              format: item.audio.format
            }
          }
        case 'video':
          // Venice may convert video to series of frames or process directly
          return {
            type: 'video_url',
            video_url: {
              url: item.video.url,
              format: item.video.format
            }
          }
        default:
          throw new Error(`Unsupported content type: ${(item as any).type}`)
      }
    })
  }

  /**
   * Check if a Venice model supports multimodal inputs
   */
  export async function supportsMultimodal(modelId: string, apiKey?: string): Promise<boolean> {
    const capabilities = await fetchCapabilities(apiKey)
    const model = capabilities.models.find(m => m.id === modelId)

    if (!model) {
      throw new Error(`Model ${modelId} not found in Venice capabilities`)
    }

    // Check if the model supports image inputs as a proxy for multimodal support
    return model.capabilities.vision ||
           model.capabilities.multimodal ||
           (model.capabilities.input?.includes('image') ?? false)
  }

  /**
   * Get a Venice language model with multimodal support
   */
  export async function getVeniceModelWithMultimodal(
    modelId: string,
    apiKey?: string,
    options: Record<string, any> = {}
  ) {
    const isMultimodalSupported = await supportsMultimodal(modelId, apiKey)

    if (!isMultimodalSupported) {
      console.warn(`Model ${modelId} may not support multimodal inputs based on Venice capabilities`)
    }

    const veniceProvider = createVeniceProvider(apiKey, options)
    return veniceProvider.languageModel(modelId) as LanguageModelV2
  }

  /**
   * Character-related interfaces and types
   */
  export interface VeniceCharacter {
    slug: string
    name: string
    description: string
    system_prompt?: string
    traits: string[]
  }

  export interface VeniceCharacterList {
    characters: VeniceCharacter[]
  }

  // Character cache to avoid repeated API calls
  const characterCache = new Map<string, { data: VeniceCharacterList, timestamp: number }>()
  const CHARACTER_CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

  /**
   * Fetch available characters from Venice API
   */
  export async function fetchCharacters(apiKey?: string): Promise<VeniceCharacterList> {
    const cacheKey = "venice_characters"
    const cached = characterCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CHARACTER_CACHE_DURATION) {
      return cached.data
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      const response = await fetchWithRetry(`${DEFAULT_BASE_URL}/characters`, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch Venice characters: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      const characterList: VeniceCharacterList = {
        characters: Array.isArray(data) ? data : (data.characters || []),
      }

      // Cache the result
      characterCache.set(cacheKey, {
        data: characterList,
        timestamp: Date.now(),
      })

      return characterList
    } catch (error) {
      console.error("Error fetching Venice characters:", error)
      // Return empty character list if fetch fails, but log the error
      return {
        characters: [],
      }
    }
  }

  /**
   * Get a specific character by slug
   */
  export async function getCharacter(slug: string, apiKey?: string): Promise<VeniceCharacter | undefined> {
    const characters = await fetchCharacters(apiKey)
    return characters.characters.find(char => char.slug === slug)
  }

  /**
   * Create a Venice provider instance with character support
   */
  export function createVeniceProviderWithCharacter(
    apiKey?: string,
    characterSlug?: string,
    options: Record<string, any> = {}
  ) {
    const baseOptions = {
      apiKey,
      baseURL: DEFAULT_BASE_URL,
      name: "venice",
      // Add character parameter if specified
      ...(characterSlug && {
        venice_parameters: {
          character_slug: characterSlug
        }
      }),
      // Add custom fetch with retry logic
      fetch: async (input: any, init?: any) => {
        // Apply retry logic to individual requests
        return fetchWithRetry(input, init || {}).then(response => response)
      },
      ...options,
    }

    return createOpenaiCompatible(baseOptions)
  }

  /**
   * Get a Venice language model with character support
   */
  export async function getVeniceModelWithCharacter(
    modelId: string,
    characterSlug?: string,
    apiKey?: string,
    options: Record<string, any> = {}
  ) {
    const veniceProvider = createVeniceProviderWithCharacter(apiKey, characterSlug, options)
    return veniceProvider.languageModel(modelId) as LanguageModelV2
  }

  /**
   * Clear the capability cache (useful for testing or forcing refresh)
   */
  export function clearCache() {
    capabilityCache.clear()
    characterCache.clear()
  }
}