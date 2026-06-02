import { NextResponse } from 'next/server';
import {
  getAiAssistantProvider,
  isAiAssistantDisabled,
} from '../../../../lib/ai/tripParseConfig';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    disabled: isAiAssistantDisabled(),
    provider: getAiAssistantProvider(),
  });
}
