import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Area, Skill } from '@shared/types';

export function useAreas() {
  const [areas, setAreas] = useState<(Area & { skills: Skill[] })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    const data = await api.getAreas();
    setAreas(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  const createArea = async (name: string, color: string) => {
    await api.createArea({ name, color });
    await fetchAreas();
  };

  const updateArea = async (id: string, data: { name?: string; color?: string }) => {
    await api.updateArea(id, data);
    await fetchAreas();
  };

  const deleteArea = async (id: string) => {
    await api.deleteArea(id);
    await fetchAreas();
  };

  const createSkill = async (areaId: string, name: string) => {
    await api.createSkill(areaId, { name });
    await fetchAreas();
  };

  const deleteSkill = async (id: string) => {
    await api.deleteSkill(id);
    await fetchAreas();
  };

  return { areas, createArea, updateArea, deleteArea, createSkill, deleteSkill, loading, refresh: fetchAreas };
}
