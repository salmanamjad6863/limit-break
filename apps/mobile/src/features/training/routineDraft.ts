/**
 * The routine being edited, shared by the editor and the exercise picker. Kept in memory only:
 * leaving the editor and coming back resumes the same unsaved edit (with a "Discard" option).
 */
import type { Routine } from '@lb/engine';
import { create } from 'zustand';

interface DraftState {
  draft: Routine | null;
  dirty: boolean;
  begin: (r: Routine) => void;
  update: (fn: (r: Routine) => Routine) => void;
  saved: (r: Routine) => void;
  clear: () => void;
}

export const useRoutineDraft = create<DraftState>()((set) => ({
  draft: null,
  dirty: false,
  begin: (r) => set({ draft: r, dirty: false }),
  update: (fn) => set((s) => (s.draft ? { draft: fn(s.draft), dirty: true } : s)),
  saved: (r) => set({ draft: r, dirty: false }),
  clear: () => set({ draft: null, dirty: false }),
}));
