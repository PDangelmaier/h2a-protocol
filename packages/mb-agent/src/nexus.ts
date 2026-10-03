import type { NexusConfig } from './types.js'

export interface SystemBlock {
  text?: string
  cachePoint?: { type: 'default' }
}

export interface NexusRequest {
  modelId: string
  system: SystemBlock[]
  messages: Array<{ role: string; content: Array<{ text: string }> }>
  inferenceConfig: { temperature: number; maxTokens: number }
  toolConfig?: { tools: Array<{ toolSpec: { name: string; description: string; inputSchema: { json: Record<string, unknown> } } }> }
  guardrailConfig?: { guardrailIdentifier: string; guardrailVersion: string }
}

interface StreamEvent {
  type: 'messageStart' | 'contentBlockStart' | 'contentBlockDelta' | 'contentBlockStop' | 'messageStop' | 'metadata'
  delta?: { text?: string }
  contentBlock?: { toolUse?: { toolUseId: string; name: string } }
  toolUse?: { input: string }
  stopReason?: string
  usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens?: number }
}

export interface NexusStreamResult {
  text: string
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  stopReason: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
}

export async function callNexusStream(
  request: NexusRequest,
  config: NexusConfig,
): Promise<NexusStreamResult> {
  const url = `${config.endpoint}/model/${request.modelId}/converse-stream`

  const body = {
    system: request.system,
    messages: request.messages,
    inferenceConfig: request.inferenceConfig,
    ...(request.toolConfig ? { toolConfig: request.toolConfig } : {}),
    ...(request.guardrailConfig ? { guardrailConfig: request.guardrailConfig } : {}),
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.bearerToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new NexusError(`Nexus ${response.status}: ${errorText}`, response.status)
  }

  return parseEventStream(response)
}

export async function callNexusSync(
  request: NexusRequest,
  config: NexusConfig,
): Promise<NexusStreamResult> {
  const url = `${config.endpoint}/model/${request.modelId}/converse`

  const body = {
    system: request.system,
    messages: request.messages,
    inferenceConfig: request.inferenceConfig,
    ...(request.toolConfig ? { toolConfig: request.toolConfig } : {}),
    ...(request.guardrailConfig ? { guardrailConfig: request.guardrailConfig } : {}),
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.bearerToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new NexusError(`Nexus ${response.status}: ${errorText}`, response.status)
  }

  const data = await response.json() as {
    output?: { message?: { content?: Array<{ text?: string; toolUse?: { toolUseId: string; name: string; input: Record<string, unknown> } }> } }
    stopReason?: string
    usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens?: number }
  }

  const content = data.output?.message?.content ?? []
  const text = content.filter(c => c.text).map(c => c.text!).join('')
  const toolCalls = content.filter(c => c.toolUse).map(c => ({
    id: c.toolUse!.toolUseId,
    name: c.toolUse!.name,
    input: c.toolUse!.input,
  }))

  return {
    text,
    toolCalls,
    stopReason: data.stopReason ?? 'end_turn',
    inputTokens: data.usage?.inputTokens ?? 0,
    outputTokens: data.usage?.outputTokens ?? 0,
    cacheReadInputTokens: data.usage?.cacheReadInputTokens ?? 0,
  }
}

async function parseEventStream(response: Response): Promise<NexusStreamResult> {
  const reader = response.body?.getReader()
  if (!reader) throw new NexusError('No response body', 0)

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const toolCalls: NexusStreamResult['toolCalls'] = []
  let currentToolId = ''
  let currentToolName = ''
  let currentToolInput = ''
  let stopReason = 'end_turn'
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadInputTokens = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = extractEvents(buffer)
      buffer = events.remaining

      for (const event of events.parsed) {
        switch (event.type) {
          case 'contentBlockStart':
            if (event.contentBlock?.toolUse) {
              currentToolId = event.contentBlock.toolUse.toolUseId
              currentToolName = event.contentBlock.toolUse.name
              currentToolInput = ''
            }
            break
          case 'contentBlockDelta':
            if (event.delta?.text) text += event.delta.text
            if (event.toolUse?.input) currentToolInput += event.toolUse.input
            break
          case 'contentBlockStop':
            if (currentToolId) {
              toolCalls.push({
                id: currentToolId,
                name: currentToolName,
                input: safeParseJson(currentToolInput),
              })
              currentToolId = ''
            }
            break
          case 'messageStop':
            stopReason = event.stopReason ?? 'end_turn'
            break
          case 'metadata':
            inputTokens = event.usage?.inputTokens ?? inputTokens
            outputTokens = event.usage?.outputTokens ?? outputTokens
            cacheReadInputTokens = event.usage?.cacheReadInputTokens ?? cacheReadInputTokens
            break
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text, toolCalls, stopReason, inputTokens, outputTokens, cacheReadInputTokens }
}

interface ExtractedEvents {
  parsed: StreamEvent[]
  remaining: string
}

function extractEvents(buffer: string): ExtractedEvents {
  const parsed: StreamEvent[] = []
  const lines = buffer.split('\n')
  let remaining = ''
  let eventType = ''
  let eventData = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith(':event-type ')) {
      eventType = line.slice(12).trim()
    } else if (line.startsWith(':content-type ')) {
      // skip content-type header
    } else if (line.startsWith('{')) {
      eventData = line
      try {
        const data = JSON.parse(eventData)
        parsed.push({ type: eventType as StreamEvent['type'], ...data })
        eventType = ''
        eventData = ''
      } catch {
        if (i === lines.length - 1) {
          remaining = line
        }
      }
    } else if (line === '') {
      // event separator
    } else if (i === lines.length - 1 && line.length > 0) {
      remaining = line
    }
  }

  return { parsed, remaining }
}

function safeParseJson(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input) as Record<string, unknown>
  } catch {
    return { raw: input }
  }
}

export class NexusError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'NexusError'
  }

  get isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500
  }
}
