import type { SupabaseClient } from '@supabase/supabase-js'
import { trackDegradedResponse } from './langfuse.js'

export type DegradationReason = 'fallback_exhausted' | 'cost_limit' | 'internal_error'

interface ContactOption {
  type: string
  label: string
  value: string
}

interface DegradedResult {
  message: string
  contactOptions: ContactOption[]
  reason: DegradationReason
}

const FALLBACK_MESSAGES: Record<string, string> = {
  de: 'Entschuldigung, ich kann Ihre Anfrage gerade nicht verarbeiten. Bitte wenden Sie sich an unseren Kundenservice.',
  en: 'I am sorry, I cannot process your request right now. Please contact our customer service.',
}

export async function buildDegradedResponse(
  reason: DegradationReason,
  locale: string,
  supabase: SupabaseClient,
): Promise<DegradedResult> {
  const lang = locale.startsWith('en') ? 'en' : 'de'

  const { data } = await supabase
    .from('degradation_config')
    .select('message, contact_options')
    .eq('locale', lang)
    .eq('is_active', true)
    .single()

  const message = data?.message ?? FALLBACK_MESSAGES[lang] ?? FALLBACK_MESSAGES.de
  const contactOptions = (data?.contact_options ?? []) as ContactOption[]

  trackDegradedResponse(reason).catch(() => {})

  return { message, contactOptions, reason }
}

export function formatDegradedForCustomer(result: DegradedResult): string {
  const lines = [result.message]
  for (const opt of result.contactOptions) {
    lines.push(`${opt.label}: ${opt.value}`)
  }
  return lines.join('\n')
}
