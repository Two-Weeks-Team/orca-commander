/**
 * Agent plan usage read from the paired host's `accounts.list` (the desktop "Usage" panel's RateLimitState).
 * Only bounded numbers and status are kept: no account names, emails, tokens or error text.
 */
export interface UsageWindow { usedPercent: number; resetsAt: number | null }
export interface ProviderUsage {
  status: 'ok' | 'fetching' | 'idle' | 'error' | 'unavailable';
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  fableWeekly: UsageWindow | null;
  updatedAt: number | null;
}
export interface UsageSnapshot { claude: ProviderUsage | null; codex: ProviderUsage | null; observedAt: number }

const isRec = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const STATUSES = new Set(['ok', 'fetching', 'idle', 'error', 'unavailable']);
const MAX_MS = 8.64e15;

function parseWindow(value: unknown): UsageWindow | null {
  if (!isRec(value)) return null;
  const used = value.usedPercent;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  const resets = value.resetsAt;
  return {
    usedPercent: Math.min(100, Math.max(0, used)),
    resetsAt: typeof resets === 'number' && Number.isFinite(resets) && Math.abs(resets) <= MAX_MS ? resets : null,
  };
}

function parseProvider(value: unknown): ProviderUsage | null {
  if (!isRec(value)) return null;
  const status = typeof value.status === 'string' && STATUSES.has(value.status) ? value.status as ProviderUsage['status'] : 'unavailable';
  const updated = value.updatedAt;
  return {
    status,
    session: parseWindow(value.session),
    weekly: parseWindow(value.weekly),
    fableWeekly: parseWindow(value.fableWeekly),
    updatedAt: typeof updated === 'number' && Number.isFinite(updated) && updated > 0 && updated <= MAX_MS ? updated : null,
  };
}

export function parseAccountsUsage(result: unknown, observedAt: number): UsageSnapshot | null {
  if (!isRec(result) || !isRec(result.rateLimits)) return null;
  return { claude: parseProvider(result.rateLimits.claude), codex: parseProvider(result.rateLimits.codex), observedAt };
}

/** Whole percent for a compact LCD; null when the window is unknown. */
export const percent = (window: UsageWindow | null | undefined): number | null => window ? Math.round(window.usedPercent) : null;

/** "5h 12m" / "3d 4h" / "12m" until reset; null when unknown or already past. */
export function untilReset(window: UsageWindow | null | undefined, now: number): string | null {
  if (!window?.resetsAt) return null;
  const minutes = Math.floor((window.resetsAt - now) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/** The desktop's sidebar order settings: `ui.get` sortBy/projectOrderBy and the project catalog's repo order. */
export interface OrderSnapshot { observedAt?: number; sortBy?: 'name'|'smart'|'recent'|'repo'|'manual'; projectOrderBy?: 'manual'|'recent'; repoOrder?: string[] }
const SORTS = new Set(['name', 'smart', 'recent', 'repo', 'manual']), PROJECT_ORDERS = new Set(['manual', 'recent']);
export function parseOrderSettings(ui: unknown, sections: unknown): OrderSnapshot {
  const out: OrderSnapshot = {};
  const state = isRec(ui) && isRec(ui.ui) ? ui.ui : undefined;
  if (state && typeof state.sortBy === 'string' && SORTS.has(state.sortBy)) out.sortBy = state.sortBy as OrderSnapshot['sortBy'];
  const catalog = isRec(sections) && isRec(sections.catalog) ? sections.catalog : undefined;
  const projectOrderBy = state?.projectOrderBy ?? catalog?.projectOrderBy;
  if (typeof projectOrderBy === 'string' && PROJECT_ORDERS.has(projectOrderBy)) out.projectOrderBy = projectOrderBy as OrderSnapshot['projectOrderBy'];
  if (catalog && Array.isArray(catalog.repos)) {
    const ids = catalog.repos.flatMap(repo => isRec(repo) && typeof repo.id === 'string' && repo.id.length <= 256 ? [repo.id] : []).slice(0, 1000);
    if (ids.length) out.repoOrder = ids;
  }
  return out;
}
