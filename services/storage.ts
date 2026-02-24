import { AppState } from '../types';

const STATE_KEY = 'finclassify_v3_state';

export const StorageService = {
  loadState: (): AppState | null => {
    try {
      const data = localStorage.getItem(STATE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to load state', e);
      return null;
    }
  },

  saveState: (state: AppState) => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state - quota exceeded?', e);
      // In a real app, dispatch a banner error here
    }
  },

  clearAll: () => {
    localStorage.removeItem(STATE_KEY);
  }
};