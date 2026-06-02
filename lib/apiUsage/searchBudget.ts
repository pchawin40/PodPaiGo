type ActiveSearchBudget = {
  key: string;
  routeCalls: number;
  quoteCalls: number;
};

let activeSearchBudget: ActiveSearchBudget | null = null;

export function runWithSearchBudget<T>(searchKey: string, fn: () => T | Promise<T>): Promise<T> {
  activeSearchBudget = { key: searchKey, routeCalls: 0, quoteCalls: 0 };

  return Promise.resolve(fn()).finally(() => {
    activeSearchBudget = null;
  });
}

export function getActiveSearchBudget(): ActiveSearchBudget | null {
  return activeSearchBudget;
}

export function tryConsumeSearchRouteCall(): boolean {
  const max = Number(process.env.MAX_GOOGLE_ROUTE_CALLS_PER_SEARCH || 3);
  const limit = Number.isFinite(max) && max >= 0 ? Math.floor(max) : 3;

  if (!activeSearchBudget) {
    return true;
  }

  if (activeSearchBudget.routeCalls >= limit) {
    return false;
  }

  activeSearchBudget.routeCalls += 1;
  return true;
}

export function tryConsumeSearchQuoteCall(): boolean {
  const max = Number(process.env.MAX_LIVE_QUOTES_PER_SEARCH || 3);
  const limit = Number.isFinite(max) && max >= 0 ? Math.floor(max) : 3;

  if (!activeSearchBudget) {
    return true;
  }

  if (activeSearchBudget.quoteCalls >= limit) {
    return false;
  }

  activeSearchBudget.quoteCalls += 1;
  return true;
}

export function resetSearchBudgetForTests(): void {
  activeSearchBudget = null;
}
