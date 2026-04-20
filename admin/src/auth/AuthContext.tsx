import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getClient, initSupabase } from "@/lib/supabaseClient";

type AuthState = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = await initSupabase();
        setConfigured(true);
        const { data } = await sb.auth.getSession();
        setSession(data.session);
        sb.auth.onAuthStateChange((_e, s) => setSession(s));
      } catch (e) {
        setConfigured(false);
        setError(e instanceof Error ? e.message : "Config error");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getClient();
    if (!sb) return { error: "Not configured" };
    const { error: err } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: err?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getClient();
    await sb?.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ ready, configured, session, error, signIn, signOut }),
    [ready, configured, session, error, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
