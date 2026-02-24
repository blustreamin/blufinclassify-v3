
const DB_NAME = 'bluFinV3_Files';
const STORE_NAME = 'files';
const PARSED_STORE_NAME = 'parsed_data';
const DB_VERSION = 2;

export const IDBService = {
  openDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject('IndexedDB error');
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PARSED_STORE_NAME)) {
            db.createObjectStore(PARSED_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };
    });
  },

  saveFile: async (id: string, file: File | Blob): Promise<string> => {
    const db = await IDBService.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, blob: file, type: file.type, name: (file as File).name });

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject('Failed to save file');
    });
  },

  getFile: async (id: string): Promise<{ blob: Blob, type: string, name: string } | null> => {
    try {
        const db = await IDBService.openDB();
        return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
            const result = request.result;
            resolve(result ? { blob: result.blob, type: result.type, name: result.name } : null);
        };
        request.onerror = () => reject('Failed to load file');
        });
    } catch (e) {
        console.error("IDB Get Error", e);
        return null;
    }
  },

  saveParsedData: async (id: string, data: any): Promise<void> => {
      const db = await IDBService.openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction([PARSED_STORE_NAME], 'readwrite');
          const store = transaction.objectStore(PARSED_STORE_NAME);
          const request = store.put({ id, data, updatedAt: Date.now() });
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject('Failed to save parsed data');
      });
  },

  getParsedData: async (id: string): Promise<any | null> => {
      try {
        const db = await IDBService.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PARSED_STORE_NAME], 'readonly');
            const store = transaction.objectStore(PARSED_STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : null);
            };
            request.onerror = () => reject('Failed to load parsed data');
        });
      } catch (e) {
          return null;
      }
  }
};