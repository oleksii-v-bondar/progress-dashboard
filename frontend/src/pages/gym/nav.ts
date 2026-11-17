export type Navigate = (view: string) => void;

export type GymView =
  | { page: 'plans' }
  | { page: 'new' }
  | { page: 'history' }
  | { page: 'plan'; id: string }
  | { page: 'edit'; id: string }
  | { page: 'session'; dayId: string }
  | { page: 'historyDetail'; id: string }
  | { page: 'historyEdit'; id: string }
  | { page: 'progress'; exerciseId: string };

export const gymViews = {
  plans: 'gym-plans',
  newPlan: 'gym-new',
  history: 'gym-history',
  plan: (id: string) => `gym-plan-${id}`,
  edit: (id: string) => `gym-edit-${id}`,
  session: (dayId: string) => `gym-session-${dayId}`,
  historyDetail: (id: string) => `gym-history-${id}`,
  historyEdit: (id: string) => `gym-history-edit-${id}`,
  progress: (exerciseId: string) => `gym-progress-${exerciseId}`,
};

export const isGymView = (view: string) => view.startsWith('gym-');

// Order matters: 'gym-history-edit-' must be checked before 'gym-history-'.
const PREFIXES: Array<[string, (rest: string) => GymView]> = [
  ['gym-history-edit-', (id) => ({ page: 'historyEdit', id })],
  ['gym-history-', (id) => ({ page: 'historyDetail', id })],
  ['gym-plan-', (id) => ({ page: 'plan', id })],
  ['gym-edit-', (id) => ({ page: 'edit', id })],
  ['gym-session-', (dayId) => ({ page: 'session', dayId })],
  ['gym-progress-', (exerciseId) => ({ page: 'progress', exerciseId })],
];

export function parseGymView(view: string): GymView | null {
  if (view === gymViews.plans) return { page: 'plans' };
  if (view === gymViews.newPlan) return { page: 'new' };
  if (view === gymViews.history) return { page: 'history' };
  for (const [prefix, make] of PREFIXES) {
    if (view.startsWith(prefix) && view.length > prefix.length) return make(view.slice(prefix.length));
  }
  return null;
}

/** Sidebar item to highlight for a gym view. */
export function gymNavSection(view: string): string | null {
  const v = parseGymView(view);
  if (!v) return null;
  if (v.page === 'new') return gymViews.newPlan;
  if (v.page === 'history' || v.page === 'historyDetail' || v.page === 'historyEdit') return gymViews.history;
  return gymViews.plans;
}
