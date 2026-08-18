import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Note } from '@shared/types';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const data = await api.getNotes();
    setNotes(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const createNote = async (content: string) => {
    await api.createNote(content);
    await fetchNotes();
  };

  const updateNote = async (id: string, data: { content?: string; answered?: boolean }) => {
    await api.updateNote(id, data);
    await fetchNotes();
  };

  const deleteNote = async (id: string) => {
    await api.deleteNote(id);
    await fetchNotes();
  };

  return { notes, createNote, updateNote, deleteNote, loading, refresh: fetchNotes };
}
