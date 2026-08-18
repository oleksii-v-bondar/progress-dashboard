import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { TaskWithDetails } from '@shared/types';

interface TaskFilters {
  status?: string;
  area_id?: string;
  skill_id?: string;
}

export function useTasks(filters?: TaskFilters) {
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const data = await api.getTasks(filters);
    setTasks(data);
    setLoading(false);
  }, [filters?.status, filters?.area_id, filters?.skill_id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async (data: { skill_id: string; name: string; description?: string; status?: string }) => {
    await api.createTask(data);
    await fetchTasks();
  };

  const updateTask = async (id: string, data: { name?: string; description?: string }) => {
    await api.updateTask(id, data);
    await fetchTasks();
  };

  const moveTask = async (id: string, status: string) => {
    await api.moveTask(id, status);
    await fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await api.deleteTask(id);
    await fetchTasks();
  };

  const toggleComplete = async (id: string, currentlyCompleted: boolean) => {
    if (currentlyCompleted) {
      await api.uncompleteTask(id);
    } else {
      await api.completeTask(id);
    }
    await fetchTasks();
  };

  const reorder = async (sourceIndex: number, destinationIndex: number) => {
    // Optimistic update
    const reordered = [...tasks];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    setTasks(reordered);
    // Persist
    await api.reorderTasks(reordered.map(t => t.id));
  };

  return { tasks, createTask, updateTask, moveTask, deleteTask, toggleComplete, reorder, loading, refresh: fetchTasks };
}
