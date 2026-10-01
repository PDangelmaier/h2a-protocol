const AVG_CHARS_PER_TOKEN = 3.5
const _NEGATIVE_TEST_MODEL = 'claude-sonnet-4-6'

export function estimateTokens(input: unknown): number {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}
