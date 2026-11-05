import type { AuthUser } from "@/_core/hooks/useAuth";
import { assertActiveOwner, OwnerChangedError } from "@/lib/owner-guard";
import {
  clearOfflineProfile,
  loadLocalSnapshot,
  loadOfflineProfile,
  saveLocalSnapshot,
  saveOfflineProfile,
  type OfflineProfile,
} from "@/lib/local-data";
import { getSupabaseClient, PROGRESS_PHOTO_BUCKET, supabaseConfigured } from "@/lib/supabase";
import {
  AthleteProfileSchema,
  emptyTrackerSnapshot,
  mergeAthleteProfiles,
  TrackerSnapshotSchema,
  type TrackerSnapshot,
} from "@shared/tracker";
import { useCallback, useEffect, useRef, useState } from "react";

type SyncStatus = "synced" | "syncing" | "offline" | "local";

function profileForUser(user: AuthUser): OfflineProfile {
  return { userId: user.id, name: user.name || "Athlete" };
}

function deletedStorageKeys(snapshot: TrackerSnapshot, userId: string): string[] {
  const prefix = `users/${userId}/`;
  return snapshot.photos
    .filter(photo => photo.deletedAt !== null && photo.storageKey.startsWith(prefix))
    .map(photo => photo.storageKey);
}

export function useTracker(
  authUser: AuthUser | null,
  authError: boolean,
  refreshAuth: () => unknown,
) {
  const activeProfile = useRef<OfflineProfile | null>(null);
  const currentSnapshot = useRef<TrackerSnapshot>(emptyTrackerSnapshot());
  const authenticated = useRef(Boolean(authUser));
  const authenticatedUserId = useRef(authUser?.id ?? null);
  const refreshFunction = useRef(refreshAuth);
  const identityGeneration = useRef(0);
  const renderIdentity = authUser
    ? `user:${authUser.id}`
    : authError
      ? "offline-candidate"
      : "signed-out";
  const previousRenderIdentity = useRef<string | null>(null);
  const [profile, setProfile] = useState<OfflineProfile | null>(null);
  const [snapshot, setSnapshot] = useState<TrackerSnapshot>(emptyTrackerSnapshot());
  const [ready, setReady] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");

  if (previousRenderIdentity.current !== renderIdentity) {
    previousRenderIdentity.current = renderIdentity;
    identityGeneration.current += 1;
    activeProfile.current = null;
  }
  authenticated.current = Boolean(authUser);
  authenticatedUserId.current = authUser?.id ?? null;
  refreshFunction.current = refreshAuth;

  const userId = authUser?.id ?? null;
  const userName = authUser?.name ?? "Athlete";

  const isCurrentOwner = useCallback((owner: OfflineProfile, generation: number) =>
    identityGeneration.current === generation &&
    activeProfile.current?.userId === owner.userId,
  []);

  const synchronize = useCallback(async (
    owner: OfflineProfile,
    data: TrackerSnapshot,
    generation: number,
  ) => {
    const belongsToSignedInOwner = () =>
      isCurrentOwner(owner, generation) &&
      authenticated.current &&
      authenticatedUserId.current === owner.userId;

    if (!belongsToSignedInOwner() || !navigator.onLine || !supabaseConfigured) {
      if (isCurrentOwner(owner, generation)) setSyncStatus("offline");
      return data;
    }

      setSyncStatus("syncing");
    try {
      const validInput = TrackerSnapshotSchema.parse(data);
      const assertAuthOwner = async () => {
        const { data: authData, error: authError } = await getSupabaseClient().auth.getUser();
        if (authError) throw authError;
        if (!belongsToSignedInOwner() || !authData.user || authData.user.id !== owner.userId) {
          throw new OwnerChangedError();
        }
        return authData.user;
      };

      const authUser = await assertAuthOwner();
      const remoteProfileResult = AthleteProfileSchema.safeParse(authUser.user_metadata?.repbook_profile);
      const remoteProfile = remoteProfileResult.success ? remoteProfileResult.data : null;
      const mergedProfile = mergeAthleteProfiles(validInput.profile, remoteProfile);
      if (mergedProfile && JSON.stringify(mergedProfile) !== JSON.stringify(remoteProfile)) {
        const currentAuthUser = await assertAuthOwner();
        const { data: updatedAuth, error: profileError } = await getSupabaseClient().auth.updateUser({
          data: { ...currentAuthUser.user_metadata, repbook_profile: mergedProfile },
        });
        if (profileError) throw profileError;
        if (updatedAuth.user?.id !== owner.userId || !belongsToSignedInOwner()) {
          throw new OwnerChangedError();
        }
      }
      await assertAuthOwner();

      const { data: mergedData, error } = await getSupabaseClient()
        .rpc("sync_fitness_snapshot", { p_local: { ...validInput, profile: mergedProfile } });
      if (error) throw error;
      const parsed = TrackerSnapshotSchema.safeParse({ ...mergedData, profile: mergedProfile });
      if (!parsed.success) throw new Error("Supabase returned an invalid tracker snapshot.");
      const merged = parsed.data;

      if (belongsToSignedInOwner()) {
        const keys = [...new Set(deletedStorageKeys(merged, owner.userId))];
        if (keys.length) {
          const { error: removeError } = await getSupabaseClient()
            .storage.from(PROGRESS_PHOTO_BUCKET).remove(keys);
          if (removeError) throw removeError;
        }
      }

      await saveLocalSnapshot(owner.userId, merged);
      if (belongsToSignedInOwner()) {
        currentSnapshot.current = merged;
        setSnapshot(merged);
        setSyncStatus("synced");
      }
      return merged;
    } catch (error) {
      if (belongsToSignedInOwner()) setSyncStatus("offline");
      if (!(error instanceof OwnerChangedError)) {
        console.warn("[RepBook] Cloud sync will retry when you reconnect.");
      }
      return data;
    }
  }, [isCurrentOwner]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setSnapshot(emptyTrackerSnapshot());
    currentSnapshot.current = emptyTrackerSnapshot();
    setProfile(null);
    activeProfile.current = null;
    const generation = identityGeneration.current;

    let nextProfile: OfflineProfile | null = null;
    if (authUser) {
      nextProfile = profileForUser(authUser);
      saveOfflineProfile(nextProfile);
      setOfflineMode(false);
    } else if (authError) {
      nextProfile = loadOfflineProfile();
      setOfflineMode(Boolean(nextProfile));
    } else {
      setOfflineMode(false);
      setSyncStatus("local");
      setReady(true);
      return () => { cancelled = true; };
    }

    if (!nextProfile) {
      setReady(true);
      return () => { cancelled = true; };
    }

    activeProfile.current = nextProfile;
    setProfile(nextProfile);
    void loadLocalSnapshot(nextProfile.userId).then(async localSnapshot => {
      if (cancelled || !isCurrentOwner(nextProfile!, generation)) return;
      currentSnapshot.current = localSnapshot;
      setSnapshot(localSnapshot);
      setReady(true);
      if (authUser && navigator.onLine) {
        await synchronize(nextProfile!, localSnapshot, generation);
      } else {
        setSyncStatus("offline");
      }
    }).catch(() => {
      if (!cancelled && isCurrentOwner(nextProfile!, generation)) setReady(true);
    });

    return () => { cancelled = true; };
  }, [userId, userName, authError, synchronize, isCurrentOwner]);

  const saveChanges = useCallback(async (next: TrackerSnapshot, expectedUserId = profile?.userId) => {
    const owner = activeProfile.current;
    if (!expectedUserId) throw new OwnerChangedError();
    assertActiveOwner(expectedUserId, owner?.userId ?? null);
    if (!owner) throw new OwnerChangedError();
    const generation = identityGeneration.current;
    const valid = TrackerSnapshotSchema.parse(next);
    currentSnapshot.current = valid;
    setSnapshot(valid);
    setSyncStatus(authenticated.current && navigator.onLine ? "syncing" : "offline");
    try {
      await saveLocalSnapshot(owner.userId, valid);
    } catch (error) {
      console.error("[RepBook] Could not save the local copy.", error);
    }
    if (!isCurrentOwner(owner, generation)) return;
    if (authenticated.current && authenticatedUserId.current === owner.userId && navigator.onLine) {
      await synchronize(owner, valid, generation);
    } else {
      setSyncStatus("offline");
    }
  }, [profile?.userId, synchronize, isCurrentOwner]);

  const signOutLocally = useCallback(() => {
    clearOfflineProfile();
    identityGeneration.current += 1;
    previousRenderIdentity.current = "signed-out";
    activeProfile.current = null;
    setProfile(null);
    setOfflineMode(false);
    setReady(true);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      void refreshFunction.current();
      const owner = activeProfile.current;
      const generation = identityGeneration.current;
      if (owner && authenticated.current) {
        void synchronize(owner, currentSnapshot.current, generation);
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [synchronize]);

  return { profile, snapshot, ready, offlineMode, syncStatus, saveChanges, signOutLocally };
}
