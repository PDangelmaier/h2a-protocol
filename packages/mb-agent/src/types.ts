export type Channel = 'web' | 'smart_storefront' | 'whatsapp' | 'mbux' | 'voice' | 'app' | 'dealer'

export type IdentityTier = 'anonymous' | 'recognized' | 'soft_login' | 'identified' | 'premium'

export type JourneyPhase = 'awareness' | 'research' | 'configuration' | 'pricing' | 'purchase' | 'order' | 'onboarding' | 'ownership' | 'service' | 'lifecycle'

export type ProactivityLevel = 'still' | 'ready' | 'attentive' | 'accompanying' | 'engaged'

export type SessionStatus = 'active' | 'paused' | 'ended' | 'transferred'

export type MemoryType = 'fact' | 'preference' | 'context' | 'relationship' | 'decision'

export type EndpointType = 'agent_garden' | 'mcp' | 'rest' | 'n8n'

export interface ChannelMetadata {
  sessionCookie?: string
  authToken?: string
  socialToken?: string
  phoneNumber?: string
  mercedesMeId?: string
  vehicleVin?: string
  qrCode?: string
}

export interface ResolvedIdentity {
  profileId: string
  pidScore: number
  identityTier: IdentityTier
  isReturning: boolean
  vehicles: VehicleRef[]
  mergedThisSession: boolean
}

export interface VehicleRef {
  vin?: string
  modelId: string
  modelName: string
  connected: boolean
}

export interface CustomerContext {
  profileId: string
  pidScore: number
  displayName?: string
  locale: string
  journeyPhase: JourneyPhase
  intentScore: number
  proactivityLevel: ProactivityLevel
  vehicles: VehicleRef[]
}

export interface IntentSnapshot {
  intentScore: number
  journeyPhase: JourneyPhase
  purchaseIntent: number
  primaryInterest: string | null
  proactivityLevel: ProactivityLevel
  computedAt: Date
}

export interface CCPPersonality {
  id: string
  slug: string
  displayName: string
  systemPrompt: string
  temperature: number
}

export interface ToolResult {
  error: boolean
  data: Record<string, unknown>
}

export interface NexusConfig {
  endpoint: string
  bearerToken: string
}

export interface AgentConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  nexus: NexusConfig
  market: string
  defaultLocale: string
}
