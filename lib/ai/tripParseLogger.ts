export type AiParseLogEvent =
  | 'ai_parse_attempt'
  | 'ai_parse_success'
  | 'ai_parse_failed'
  | 'ai_parse_mock_used';

export function logAiParseEvent(
  event: AiParseLogEvent,
  meta?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'test') return;

  console.info(event, meta ?? {});
}
