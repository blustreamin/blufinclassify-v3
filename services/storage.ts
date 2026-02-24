import { AppState } from '../types';

const DB_NAME = 'bluFinV3_AppState';
const STORE_NAME = 'state';
const STATE_KEY = 'app_state';
const DB_VERSION = 1;

// Legacy localStorage key for migration
const LEGACY_KEY = 'finclassify_v3_state';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject('IndexedDB error opening state DB');
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
  });
};

export const StorageService = {
  loadState: async (): Promise<AppState | null> => {
    try {
      // 1. Try IndexedDB first
      const db = await openDB();
      const result = await new Promise<AppState | null>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(STATE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject('Failed to read state from IDB');
      });
      if (result) return result;

      // 2. Migrate from legacy localStorage if exists
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        // Save to IDB and clear localStorage
        await StorageService.saveState(parsed);
        localStorage.removeItem(LEGACY_KEY);
        console.log('Migrated state from localStorage to IndexedDB');
        return parsed;
      }

      return null;
    } catch (e) {
      console.error('Failed to load state', e);
      // Last resort fallback to localStorage
      try {
        const data = localStorage.getItem(LEGACY_KEY);
        return data ? JSON.parse(data) : null;
      } catch { return null; }
    }
  },

  saveState: async (state: AppState): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(state, STATE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject('Failed to save state to IDB');
      });
    } catch (e) {
      console.error('Failed to save state to IndexedDB', e);
    }
  },

  clearAll: async (): Promise<void> => {
    try {
      const db = await openDB();
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      console.error('Failed to clear state', e);
    }
  },

  // Full state export for backup
  exportState: async (): Promise<string | null> => {
    const state = await StorageService.loadState();
    return state ? JSON.stringify(state, null, 2) : null;
  },

  // Full state import from backup
  importState: async (json: string): Promise<AppState | null> => {
    try {
      const state = JSON.parse(json) as AppState;
      await StorageService.saveState(state);
      return state;
    } catch (e) {
      console.error('Failed to import state', e);
      return null;
    }
  }
};