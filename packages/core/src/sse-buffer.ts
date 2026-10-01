export interface SseFrame {
  event: string
  data: Record<string, unknown>
}

export interface SseBufferOptions {
  maxPending?: number
  signal?: AbortSignal
}

const DEFAULT_MAX_PENDING = 64

export class SseBuffer {
  private queue: SseFrame[] = []
  private readonly maxPending: number
  private _disconnected = false

  constructor(options: SseBufferOptions = {}) {
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING
    if (options.signal) {
      if (options.signal.aborted) {
        this._disconnected = true
      } else {
        options.signal.addEventListener('abort', () => { this._disconnected = true }, { once: true })
      }
    }
  }

  get disconnected(): boolean {
    return this._disconnected
  }

  push(frame: SseFrame): void {
    if (this._disconnected) return
    if (this.queue.length >= this.maxPending) {
      this.compactStatusFrames()
    }
    this.queue.push(frame)
  }

  drain(): string[] {
    const out: string[] = []
    while (this.queue.length > 0) {
      const frame = this.queue.shift()!
      out.push(encodeSseFrame(frame))
    }
    return out
  }

  get pendingCount(): number {
    return this.queue.length
  }

  private compactStatusFrames(): void {
    let lastStatusIdx = -1
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].event === 'status') {
        if (lastStatusIdx === -1) {
          lastStatusIdx = i
        } else {
          this.queue.splice(i, 1)
          if (lastStatusIdx > i) lastStatusIdx--
        }
      }
    }
  }
}

function encodeSseFrame(frame: SseFrame): string {
  return `data: ${JSON.stringify({ type: frame.event, ...frame.data })}\n\n`
}
