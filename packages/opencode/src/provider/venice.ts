import { createOpenaiCompatible } from "./sdk/openai-compatible/src"
import type { LanguageModel } from "ai"
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
        multimodal?: boolean
        input?: string[]
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
   * Generate a unique trace ID for requests
   */
  function generateTraceId(): string {
    return 'venice-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
  }

  /**
   * Generic fetch with retry mechanism, error handling, and tracing
   */
  async function fetchWithRetry(url: string, options: RequestInit, maxRetries = MAX_RETRIES) {
    const traceId = generateTraceId()
    log.info("Making Venice API request", {
      url,
      traceId,
      method: options.method || 'GET',
      headers: Object.keys(options.headers || {})
    })

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add trace ID to headers for server-side correlation
        const existingHeaders = options.headers as Record<string, string> | undefined
        const enhancedOptions = {
          ...options,
          headers: {
            ...existingHeaders,
            'x-trace-id': traceId,
            'user-agent': existingHeaders?.['user-agent'] || 'opencode-venice-client'
          } as Record<string, string>,
          signal: options.signal || AbortSignal.timeout(30000), // 30 second timeout
        }

        const startTime = Date.now()
        const response = await fetch(url, enhancedOptions)
        const duration = Date.now() - startTime

        log.info("Venice API response", {
          url,
          traceId,
          status: response.status,
          duration,
          attempt
        })

        // Log request and response details for debugging (without sensitive data)
        if (process.env.OPENCODE_DEBUG_LOGGING === 'true') {
          log.debug("Request details", {
            traceId,
            url,
            method: enhancedOptions.method,
            headers: Object.keys(enhancedOptions.headers),
            bodyPreview: enhancedOptions.body ?
              (typeof enhancedOptions.body === 'string' ?
                enhancedOptions.body.substring(0, 200) + '...' :
                'non-string body') :
              null
          })

          // Note: We can't easily log response body here without consuming it
          // The actual content would be logged elsewhere when processed
        }

        // Check if the response indicates a rate limit
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : calculateRetryDelay(attempt)

          if (attempt < maxRetries) {
            log.warn(`Rate limited. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`, { traceId })
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // Check for other server errors that might be retriable
        if (response.status >= 500 && response.status < 600) {
          if (attempt < maxRetries) {
            const delay = calculateRetryDelay(attempt)
            log.warn(`Server error ${response.status}. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`, { traceId })
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // For client errors (4xx), don't retry unless it's a specific case
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          // Don't retry client errors except for rate limiting
          log.warn(`Client error ${response.status}`, { traceId, url })
          return response
        }

        return response
      } catch (error) {
        log.error("Network error in Venice API request", {
          traceId,
          url,
          attempt,
          error: (error as Error).message
        })

        lastError = error as Error

        // If it's a timeout or network error, retry if attempts remain
        if (attempt < maxRetries) {
          const delay = calculateRetryDelay(attempt)
          log.info(`Network error: ${(error as Error).message}. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`, { traceId })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // If we've exhausted retries, throw the error
        log.error("Failed to complete Venice API request after retries", {
          traceId,
          url,
          maxRetries,
          finalError: (error as Error).message
        })
        throw error
      }
    }

    // This should not be reached due to the return statements above, but added for completeness
    log.error("Unexpected end of fetchWithRetry function", { traceId, url })
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
  // Custom fetch wrapper that includes preconnect property for Bun compatibility
  const createFetchWithRetry = () => {
    const fetchFn = async (input: any, init?: any) => {
      return fetchWithRetry(input, init || {}).then(response => response)
    }
    // Add preconnect property to satisfy Bun's fetch type requirements
    ;(fetchFn as any).preconnect = (url: string | URL) => {
      // Preconnect is a no-op in our custom implementation
      void url
    }
    return fetchFn as typeof fetch
  }

  export function createVeniceProvider(apiKey?: string, options: Record<string, any> = {}) {
    return createOpenaiCompatible({
      apiKey,
      baseURL: DEFAULT_BASE_URL,
      name: "venice",
      fetch: createFetchWithRetry(),
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
      fetch: createFetchWithRetry(),
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
      fetch: createFetchWithRetry(),
      ...options,
    })
  }

  /**
   * Get a Venice language model
   */
  export function getVeniceModel(modelId: string, apiKey?: string, options: Record<string, any> = {}) {
    const veniceProvider = createVeniceProvider(apiKey, options)
    return veniceProvider.languageModel(modelId) as LanguageModel
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
    return veniceProvider.languageModel(modelId) as LanguageModel
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
    return veniceProvider.languageModel(modelId) as LanguageModel
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
    return veniceProvider.languageModel(modelId) as LanguageModel
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
      fetch: createFetchWithRetry(),
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
    return veniceProvider.languageModel(modelId) as LanguageModel
  }

  /**
   * Enable or disable debug logging for Venice provider
   */
  export function setDebugLogging(enabled: boolean) {
    if (enabled) {
      process.env.OPENCODE_DEBUG_LOGGING = 'true'
      log.info("Venice provider debug logging enabled")
    } else {
      delete process.env.OPENCODE_DEBUG_LOGGING
      log.info("Venice provider debug logging disabled")
    }
  }

  /**
   * Get current trace ID for the current execution context (if available)
   */
  export function getCurrentTraceId(): string | null {
    // This would integrate with whatever tracing system is in place
    // For now, we'll return null as there's no active trace context
    return null
  }

  /**
   * Health check interface
   */
  export interface VeniceHealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded'
    timestamp: number
    message?: string
    responseTime?: number
    details?: {
      apiReachable: boolean
      authValid: boolean
      rateLimitStatus?: string
    }
  }

  /**
   * Perform a health check on the Venice API
   */
  export async function checkHealth(apiKey?: string): Promise<VeniceHealthStatus> {
    const startTime = Date.now()

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      // Make a simple request to check API health
      const response = await fetchWithRetry(`${DEFAULT_BASE_URL}/models`, {
        headers,
        method: 'GET'
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        return {
          status: 'unhealthy',
          timestamp: Date.now(),
          message: `API returned ${response.status} status`,
          responseTime,
          details: {
            apiReachable: false,
            authValid: false
          }
        }
      }

      // If we got a successful response, the API is reachable
      const data = await response.json()
      const hasModels = Array.isArray(data) || (data.data && Array.isArray(data.data))

      return {
        status: 'healthy',
        timestamp: Date.now(),
        responseTime,
        details: {
          apiReachable: true,
          authValid: !!apiKey, // If we have an API key and got a response, assume it's valid
          rateLimitStatus: response.headers.get('X-RateLimit-Remaining') || undefined
        }
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        message: `Connection failed: ${(error as Error).message}`,
        responseTime,
        details: {
          apiReachable: false,
          authValid: false
        }
      }
    }
  }

  /**
   * Get Venice status with graceful fallback mechanisms
   */
  export async function getVeniceStatus(apiKey?: string): Promise<VeniceHealthStatus> {
    const health = await checkHealth(apiKey)

    // Implement graceful fallback logic
    if (health.status !== 'healthy' && health.details?.apiReachable === false) {
      // Could implement fallback to alternative endpoints or cached data here
      console.warn('Venice API is unreachable, consider fallback mechanisms')
    }

    return health
  }

  /**
   * Clear the capability cache (useful for testing or forcing refresh)
   */
  export function clearCache() {
    capabilityCache.clear()
    characterCache.clear()
  }
}