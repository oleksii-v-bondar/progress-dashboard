import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Todo } from '@shared/types';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    const data = await api.getTodos();
    setTodos(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const createTodo = async (title: string) => {
    await api.createTodo(title);
    await fetchTodos();
  };

  const updateTodo = async (id: string, title: string) => {
    await api.updateTodo(id, title);
    await fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await api.deleteTodo(id);
    await fetchTodos();
  };

  const completeTodo = async (id: string) => {
    // Optimistic: remove from list immediately
    setTodos(prev => prev.filter(t => t.id !== id));
    await api.completeTodo(id);
  };

  const reorder = async (sourceIndex: number, destinationIndex: number) => {
    const reordered = [...todos];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    setTodos(reordered);
    await api.reorderTodos(reordered.map(t => t.id));
  };

  return { todos, createTodo, updateTodo, deleteTodo, completeTodo, reorder, loading };
}
