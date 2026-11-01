import {
  emptyTrackerSnapshot,
  TrackerSnapshotSchema,
  type TrackerSnapshot,
} from "@shared/tracker";

const DATABASE_NAME = "repbook-local";
const DATABASE_VERSION = 2;
const SNAPSHOT_STORE = "snapshots";
const PHOTO_STORE = "progressPhotos";
const OFFLINE_PROFILE_KEY = "repbook:offline-profile";

type StoredSnapshot = { userId: string; snapshot: TrackerSnapshot };
type StoredPhoto = { key: string; blob: Blob };
export type OfflineProfile = { userId: string; name: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local database is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "userId" });
      }
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local data."));
    request.onblocked = () => reject(new Error("Local data is busy in another tab."));
  });
}

function parseSnapshot(value: unknown): TrackerSnapshot | null {
  const result = TrackerSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

export async function loadLocalSnapshot(userId: string): Promise<TrackerSnapshot> {
  try {
    const database = await openDatabase();
    const stored = await new Promise<StoredSnapshot | undefined>((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, "readonly").objectStore(SNAPSHOT_STORE).get(userId);
      request.onsuccess = () => resolve(request.result as StoredSnapshot | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const valid = stored ? parseSnapshot(stored.snapshot) : null;
    if (valid) return valid;
  } catch {
    // Fall through to the JSON local-storage backup when IndexedDB is unavailable.
  }

  try {
    const raw = localStorage.getItem(`repbook:snapshot:${userId}`);
    if (raw) {
      const valid = parseSnapshot(JSON.parse(raw));
      if (valid) return valid;
    }
  } catch {
    // Storage can be disabled or full; return an empty in-memory snapshot.
  }
  return emptyTrackerSnapshot();
}

export async function saveLocalSnapshot(
  userId: string,
  snapshot: TrackerSnapshot,
): Promise<void> {
  let savedToIndexedDb = false;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
      transaction.objectStore(SNAPSHOT_STORE).put({ userId, snapshot } satisfies StoredSnapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Local save was interrupted."));
    });
    database.close();
    savedToIndexedDb = true;
  } catch (error) {
    console.warn("[RepBook] IndexedDB save failed; using JSON backup when possible.", error);
  }

  try {
    localStorage.setItem(`repbook:snapshot:${userId}`, JSON.stringify(snapshot));
  } catch (error) {
    if (!savedToIndexedDb) throw error;
  }
}

export function saveOfflineProfile(profile: OfflineProfile): void {
  try {
    localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Offline fallback is best-effort; normal authenticated use still works.
  }
}

export function loadOfflineProfile(): OfflineProfile | null {
  try {
    const raw = localStorage.getItem(OFFLINE_PROFILE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OfflineProfile>;
    if (typeof value.userId !== "string" || !/^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(value.userId)) return null;
    return {
      userId: value.userId,
      name: typeof value.name === "string" && value.name.trim() ? value.name : "Athlete",
    };
  } catch {
    return null;
  }
}

export function clearOfflineProfile(): void {
  try {
    localStorage.removeItem(OFFLINE_PROFILE_KEY);
  } catch {
    // The cached workouts remain on-device until storage is cleared by the browser.
  }
}

function storedPhotoKey(userId: string, photoId: string): string {
  return `${userId}:${photoId}`;
}

export async function saveLocalProgressPhotoBlob(
  userId: string,
  photoId: string,
  blob: Blob,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PHOTO_STORE, "readwrite");
      transaction.objectStore(PHOTO_STORE).put({ key: storedPhotoKey(userId, photoId), blob } satisfies StoredPhoto);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Photo cache save was interrupted."));
    });
  } finally {
    database.close();
  }
}

export async function loadLocalProgressPhotoBlob(
  userId: string,
  photoId: string,
): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).get(storedPhotoKey(userId, photoId));
      request.onsuccess = () => resolve((request.result as StoredPhoto | undefined)?.blob ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read the cached photo."));
    });
  } finally {
    database.close();
  }
}

export async function deleteLocalProgressPhotoBlob(
  userId: string,
  photoId: string,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PHOTO_STORE, "readwrite");
      transaction.objectStore(PHOTO_STORE).delete(storedPhotoKey(userId, photoId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Photo cache removal was interrupted."));
    });
  } finally {
    database.close();
  }
}
