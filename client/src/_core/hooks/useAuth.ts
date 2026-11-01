import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
  needsPasswordUpdate: boolean;
};

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const email = user.email ?? "";
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const name = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : email.split("@")[0] || "Athlete";
  return { id: user.id, name, email };
}

function isRecoveryEvent(event: AuthChangeEvent): boolean {
  return event === "PASSWORD_RECOVERY";
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null, needsPasswordUpdate: false });
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    if (!supabaseConfigured) {
      setState({
        user: null,
        loading: false,
        error: new Error("Supabase is not configured for this deployment yet."),
        needsPasswordUpdate: false,
      });
      return () => {
        window.removeEventListener("online", updateOnline);
        window.removeEventListener("offline", updateOnline);
      };
    }

    const supabase = getSupabaseClient();
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setState(previous => ({
        user: toAuthUser(session?.user ?? null),
        loading: false,
        error: null,
        needsPasswordUpdate: isRecoveryEvent(event)
          ? true
          : event === "USER_UPDATED" || event === "SIGNED_IN" || event === "SIGNED_OUT"
            ? false
            : previous.needsPasswordUpdate,
      }));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setState(previous => ({
        ...previous,
        user: toAuthUser(data.session?.user ?? null),
        loading: false,
        error: error ?? null,
      }));
    }).catch(error => {
      if (!active) return;
      setState(previous => ({
        ...previous,
        user: null,
        loading: false,
        error: error instanceof Error ? error : new Error("Could not restore your session."),
      }));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { confirmationRequired: !data.session };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
    setState(previous => ({ ...previous, needsPasswordUpdate: false }));
  }, []);

  const logout = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw error;
    setState({ user: null, loading: false, error: null, needsPasswordUpdate: false });
  }, []);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data, error } = await getSupabaseClient().auth.getSession();
    setState(previous => ({
      ...previous,
      user: toAuthUser(data.session?.user ?? null),
      loading: false,
      error: error ?? null,
    }));
  }, []);

  return {
    ...state,
    error: state.error ?? (!online && !state.user ? new Error("Offline") : null),
    isAuthenticated: Boolean(state.user),
    isConfigured: supabaseConfigured,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    logout,
    refresh,
  };
}
