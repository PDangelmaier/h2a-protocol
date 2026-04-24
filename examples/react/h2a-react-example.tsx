/**
 * H2A React SDK — Example Integration
 *
 * Shows how a React app connects to an H2A agent.
 * This is the developer experience H2A targets.
 */

import React, { useCallback } from 'react'

// ── H2A React SDK (planned: @h2a/react) ──

interface H2AProviderProps {
  endpoint: string
  children: React.ReactNode
  agent?: { name: string; domain?: string }
  locale?: string
  onError?: (error: H2AError) => void
}

interface H2AError {
  code: string
  message: string
  retryAfter?: number
}

type PresenceState = 'rest' | 'attentive' | 'conversing' | 'orchestrating'

interface AgentFrame {
  id: string
  frameType: string
  content: unknown
  streaming: boolean
  final: boolean
  fallbackText?: string
  metadata: {
    interruptible: boolean
    revertible: boolean
    narration?: string
  }
}

// ── Provider: wraps the app, manages H2A session ──

function H2AProvider({ endpoint, children, locale = 'de-DE' }: H2AProviderProps) {
  // In real SDK: establishes SSE connection, manages session lifecycle
  return <>{children}</>
}

// ── Hooks: the developer interface ──

function useAgent() {
  return {
    sendMessage: async (_text: string) => {},
    interrupt: async () => {},
    confirm: async (_frameId: string, _choice: string) => {},
    deny: async (_frameId: string) => {},
    frames: [] as AgentFrame[],
    isStreaming: false,
    isConnected: true,
  }
}

function usePresence() {
  return {
    state: 'rest' as PresenceState,
    confidence: 1.0,
    trigger: null as string | null,
  }
}

function useStateSync(_state: Record<string, unknown>) {
  // Sends StateSnapshot/StateDiff to agent
}

// ── Example App: Project Management with H2A Agent ──

function App() {
  return (
    <H2AProvider endpoint="/api/h2a" locale="de-DE">
      <div style={{ display: 'flex', height: '100vh' }}>
        <Navigation />
        <main style={{ flex: 1 }}>
          <TaskBoard projectId="proj_001" />
        </main>
        <AgentSurface />
      </div>
    </H2AProvider>
  )
}

function Navigation() {
  const { state } = usePresence()
  const collapsed = state === 'conversing' || state === 'orchestrating'

  return (
    <nav style={{ width: collapsed ? 64 : 260, transition: 'width 300ms ease' }}>
      {collapsed ? <IconNav /> : <FullNav />}
    </nav>
  )
}

function IconNav() {
  return <div>Icons</div>
}

function FullNav() {
  return <div>Full Navigation</div>
}

function TaskBoard({ projectId }: { projectId: string }) {
  const taskCount = 12
  const completedCount = 5

  useStateSync({
    page: { route: `/projects/${projectId}/board`, section: 'task-board' },
    data: { projectId, taskCount, completedCount, sprintPhase: 'active' },
    user: { activity: 'typing' },
  })

  return (
    <div>
      <h1>Task Board</h1>
      <div>Tasks: {completedCount}/{taskCount}</div>
    </div>
  )
}

function AgentSurface() {
  const { frames, isStreaming, sendMessage, interrupt } = useAgent()
  const { state } = usePresence()

  const handleSend = useCallback(
    (text: string) => sendMessage(text),
    [sendMessage],
  )

  const width = state === 'rest' ? 64 : 320

  return (
    <aside
      style={{ width, transition: 'width 300ms ease', borderLeft: '1px solid #eee' }}
      role="complementary"
      aria-label="AI Assistant"
      aria-live="polite"
    >
      {state === 'rest' ? (
        <RestView />
      ) : (
        <ConversationView
          frames={frames}
          isStreaming={isStreaming}
          onSend={handleSend}
          onInterrupt={interrupt}
        />
      )}
    </aside>
  )
}

function RestView() {
  return (
    <div style={{ padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 32 }}>A</div>
      <small>Alles klar.</small>
    </div>
  )
}

interface ConversationViewProps {
  frames: AgentFrame[]
  isStreaming: boolean
  onSend: (text: string) => void
  onInterrupt: () => void
}

function ConversationView({ frames, isStreaming, onSend, onInterrupt }: ConversationViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: 12, background: 'linear-gradient(135deg, #1a237e, #3f51b5)' }}>
        <strong style={{ color: 'white' }}>Atlas</strong>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }} role="log">
        {frames.map((frame) => (
          <FrameRenderer key={frame.id} frame={frame} />
        ))}
      </div>

      <footer style={{ padding: 8, borderTop: '1px solid #eee' }}>
        {isStreaming ? (
          <button onClick={onInterrupt} aria-label="Stop agent">
            Stop
          </button>
        ) : (
          <input
            type="text"
            placeholder="Nachricht..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                onSend(e.currentTarget.value)
                e.currentTarget.value = ''
              }
            }}
          />
        )}
      </footer>
    </div>
  )
}

function FrameRenderer({ frame }: { frame: AgentFrame }) {
  switch (frame.frameType) {
    case 'text':
      return <p>{String(frame.content)}</p>

    case 'tool_card': {
      const tc = frame.content as { tool: string; status: string; output?: unknown }
      return (
        <div role="status" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, margin: '8px 0' }}>
          <strong>{tc.tool}</strong>: {tc.status}
        </div>
      )
    }

    case 'confirmation': {
      const cf = frame.content as { action: string; description: string; options: { id: string; label: string }[] }
      return (
        <div role="alertdialog" style={{ background: '#fff3e0', padding: 12, borderRadius: 8, margin: '8px 0' }}>
          <p>{cf.description}</p>
          {cf.options.map((opt) => (
            <button key={opt.id} style={{ marginRight: 8 }}>
              {opt.label}
            </button>
          ))}
        </div>
      )
    }

    case 'progress': {
      const pg = frame.content as { task: string; percent: number }
      return (
        <div role="progressbar" aria-valuenow={pg.percent} aria-valuemin={0} aria-valuemax={100}>
          {pg.task}: {pg.percent}%
        </div>
      )
    }

    case 'toast': {
      const t = frame.content as { message: string; severity: string }
      return (
        <div role="alert" style={{ padding: 8, background: t.severity === 'error' ? '#ffebee' : '#e8f5e9' }}>
          {t.message}
        </div>
      )
    }

    default:
      return frame.fallbackText ? <p>{frame.fallbackText}</p> : null
  }
}

export { App, H2AProvider, useAgent, usePresence, useStateSync }
