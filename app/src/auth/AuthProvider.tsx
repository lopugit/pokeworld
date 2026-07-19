import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadThingtimeSdk } from "./thingtime-sdk";

export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface AnonymousSession {
  authenticated: false;
  isAdmin: false;
  user: null;
}

export interface AuthenticatedSession {
  authenticated: true;
  expiresAt: string;
  isAdmin: boolean;
  user: AuthUser;
}

export type AuthSession = AnonymousSession | AuthenticatedSession;
export type AuthStatus = "anonymous" | "authenticated" | "loading";

interface AuthContextValue {
  busy: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthSession>;
  session: AuthSession;
  status: AuthStatus;
}

const ANONYMOUS_SESSION: AnonymousSession = {
  authenticated: false,
  isAdmin: false,
  user: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Thingtime login could not be completed";
}

async function responsePayload(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseSession(payload: Record<string, unknown>): AuthSession {
  if (payload.authenticated !== true) return ANONYMOUS_SESSION;
  if (!payload.user || typeof payload.user !== "object") throw new Error("Pokeworld returned an invalid session");
  const user = payload.user as Record<string, unknown>;
  if (typeof user.id !== "string" || typeof user.username !== "string") {
    throw new Error("Pokeworld returned an invalid session");
  }

  return {
    authenticated: true,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : "",
    isAdmin: payload.isAdmin === true,
    user: {
      id: user.id,
      username: user.username,
      ...(typeof user.displayName === "string" ? { displayName: user.displayName } : {}),
      ...(typeof user.avatarUrl === "string" ? { avatarUrl: user.avatarUrl } : {}),
      ...(typeof user.profileUrl === "string" ? { profileUrl: user.profileUrl } : {}),
    },
  };
}

async function sessionRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });
  const payload = await responsePayload(response);
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Pokeworld session request failed");
  }
  return parseSession(payload);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(ANONYMOUS_SESSION);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await sessionRequest("/api/auth/session");
    setSession(next);
    setStatus(next.authenticated ? "authenticated" : "anonymous");
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    sessionRequest("/api/auth/session")
      .then((next) => {
        if (!active) return;
        setSession(next);
        setStatus(next.authenticated ? "authenticated" : "anonymous");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorMessage(caught));
        setStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clientId = import.meta.env.VITE_THINGTIME_CLIENT_ID?.trim();
      if (!clientId) throw new Error("Thingtime login is not configured for this Pokeworld build");

      const sdk = await loadThingtimeSdk();
      const grant = await sdk.login({
        allowExtra: false,
        clientId,
        optionalScopes: ["profile.displayName", "profile.avatar"],
        scopes: ["profile.username"],
      });
      const next = await sessionRequest("/api/auth/thingtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: grant.token }),
      });
      if (!next.authenticated) throw new Error("Pokeworld did not create a session");
      setSession(next);
      setStatus("authenticated");
    } catch (caught) {
      if (caught instanceof Error && caught.message === "cancelled") return;
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const logout = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sessionRequest("/api/auth/logout", { method: "POST" });
      setSession(next);
      setStatus("anonymous");
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const value = useMemo<AuthContextValue>(
    () => ({ busy, error, login, logout, refresh, session, status }),
    [busy, error, login, logout, refresh, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
