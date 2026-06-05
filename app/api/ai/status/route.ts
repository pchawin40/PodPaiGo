import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';
import { resolveAiEntitlements } from '../../../../lib/ai/aiEntitlements';
import {
  getAiAssistantProvider,
  isAiAssistantDisabled,
} from '../../../../lib/ai/tripParseConfig';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const authClient = createSupabaseAuthClient(accessToken);
  let userId: string | null = null;

  if (authClient && accessToken) {
    const { data } = await authClient.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const entitlements = resolveAiEntitlements({ userId });

  return NextResponse.json({
    disabled: isAiAssistantDisabled(),
    configuredProvider: getAiAssistantProvider(),
    liveProviderActive: entitlements.providerUsed === 'openai',
    provider: entitlements.providerUsed,
    providerUsed: entitlements.providerUsed,
    plan: entitlements.plan,
    mode: entitlements.mode,
    assistantLabel: entitlements.assistantLabel,
  });
}
