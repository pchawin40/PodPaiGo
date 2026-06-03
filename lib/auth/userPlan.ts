export type UserPlan = 'anonymous' | 'free' | 'plus' | 'pro' | 'admin';

export function resolveUserPlan(input: {
  userId?: string | null;
  email?: string | null;
}): UserPlan {
  if (!input.userId) return 'anonymous';

  const adminIds = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (adminIds.includes(input.userId)) {
    return 'admin';
  }

  // TODO: read subscription tier from a future subscriptions table.
  return 'free';
}
