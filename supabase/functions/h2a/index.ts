import { handleRequest, initHandler, type HandlerEnv } from '@h2a/mb-agent'

const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXUS_ENDPOINT', 'NEXUS_PRD_KEY'] as const
const OPTIONAL_VARS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL'] as const

const missing = REQUIRED_VARS.filter(v => !Deno.env.get(v))
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

const env: HandlerEnv = {
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  nexusEndpoint: Deno.env.get('NEXUS_ENDPOINT')!,
  nexusToken: Deno.env.get('NEXUS_PRD_KEY')!,
}

const optionalMissing = OPTIONAL_VARS.filter(v => !Deno.env.get(v))
if (optionalMissing.length > 0) {
  console.warn(`[h2a] Langfuse disabled — missing: ${optionalMissing.join(', ')}`)
} else {
  env.langfuse = {
    publicKey: Deno.env.get('LANGFUSE_PUBLIC_KEY')!,
    secretKey: Deno.env.get('LANGFUSE_SECRET_KEY')!,
    baseUrl: Deno.env.get('LANGFUSE_BASE_URL')!,
  }
}

initHandler(env)

Deno.serve(async (req) => {
  const { response, backgroundTasks } = await handleRequest(req, env)
  if (backgroundTasks.length > 0) {
    await Promise.allSettled(backgroundTasks)
  }
  return response
})
