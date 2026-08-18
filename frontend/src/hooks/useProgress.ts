import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { ProgressStats, AreaProgress } from '@shared/types';

interface ProgressData {
  today: ProgressStats;
  week: ProgressStats;
  areas: AreaProgress[];
}

export function useProgress() {
  const [data, setData] = useState<ProgressData>({
    today: { completed: 0, total: 0, learning: 0, todos: 0 },
    week: { completed: 0, total: 0, learning: 0, todos: 0 },
    areas: [],
  });

  const refresh = useCallback(async () => {
    const [today, week, areas] = await Promise.all([
      api.getProgressToday(),
      api.getProgressWeek(),
      api.getProgressAreas(),
    ]);
    setData({ today, week, areas });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...data, refresh };
}
