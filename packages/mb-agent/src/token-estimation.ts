const AVG_CHARS_PER_TOKEN = 3.5

export function estimateTokens(input: unknown): number {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}
