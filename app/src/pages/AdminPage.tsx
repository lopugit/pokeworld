import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { Nav } from "../components/Nav";

interface GenerationQuotaStatus {
  dailyLimit: number;
  dailyRemaining: number;
  dailyUsed: number;
  dayKey: string;
  rollingLimit: number;
  rollingRemaining: number;
  rollingWindowMs: number;
}

function parseNumber(source: Record<string, unknown>, key: keyof GenerationQuotaStatus) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid quota response");
  return value;
}

function parseQuota(payload: Record<string, unknown>): GenerationQuotaStatus {
  const candidate =
    payload.quota && typeof payload.quota === "object"
      ? (payload.quota as Record<string, unknown>)
      : payload;
  if (typeof candidate.dayKey !== "string") throw new Error("Invalid quota response");
  return {
    dailyLimit: parseNumber(candidate, "dailyLimit"),
    dailyRemaining: parseNumber(candidate, "dailyRemaining"),
    dailyUsed: parseNumber(candidate, "dailyUsed"),
    dayKey: candidate.dayKey,
    rollingLimit: parseNumber(candidate, "rollingLimit"),
    rollingRemaining: parseNumber(candidate, "rollingRemaining"),
    rollingWindowMs: parseNumber(candidate, "rollingWindowMs"),
  };
}

async function quotaRequest(method = "GET") {
  const response = await fetch("/api/admin/generation-quota", {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // A structured error below is more useful than a JSON parsing exception.
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Generation quota request failed");
  }
  return parseQuota(payload);
}

export function AdminPage() {
  const { session, status } = useAuth();
  const [quota, setQuota] = useState<GenerationQuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuota = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuota(await quotaRequest());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation quota could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session.isAdmin) void loadQuota();
  }, [loadQuota, session.isAdmin, status]);

  if (status === "loading") {
    return <div className="min-h-screen bg-green" aria-busy="true" />;
  }
  if (!session.authenticated || !session.isAdmin) return <Navigate replace to="/" />;

  const usedPercent = quota?.dailyLimit ? Math.min(100, (quota.dailyUsed / quota.dailyLimit) * 100) : 0;

  const resetQuota = async () => {
    if (!window.confirm("Reset today's global Pokeworld block-generation allowance?")) return;
    setResetting(true);
    setError(null);
    try {
      setQuota(await quotaRequest("POST"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation quota could not be reset");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-green pb-16">
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <section className="overflow-hidden rounded-2xl border-4 border-grass3 bg-gameboy-grey shadow-xl">
          <header className="border-b-4 border-grass3 bg-grass px-5 py-5 text-white sm:px-8">
            <h1 className="text-3xl font-bold sm:text-4xl">Pokeworld Admin</h1>
            <p className="mt-2 text-sm font-semibold">Signed in as @{session.user.username}</p>
          </header>
          <div className="space-y-7 px-5 py-7 sm:px-8">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-grass3">Daily block generation</h2>
                  <p className="mt-1 text-sm text-black/70">Global allowance for UTC day {quota?.dayKey || "—"}</p>
                </div>
                <strong className="text-2xl text-grass3">
                  {quota ? `${quota.dailyUsed} / ${quota.dailyLimit}` : "—"}
                </strong>
              </div>
              <div
                className="mt-4 h-5 overflow-hidden rounded-full border-2 border-grass3 bg-white"
                role="progressbar"
                aria-label="Daily generation quota used"
                aria-valuemin={0}
                aria-valuemax={quota?.dailyLimit || 500}
                aria-valuenow={quota?.dailyUsed || 0}
              >
                <div className="h-full bg-grass2 transition-[width]" style={{ width: `${usedPercent}%` }} />
              </div>
              <p className="mt-2 text-sm font-semibold text-black/70">
                {quota ? `${quota.dailyRemaining} blocks remain today.` : loading ? "Loading quota…" : "Quota unavailable."}
              </p>
            </div>

            <div className="grid gap-3 rounded-xl border-2 border-grass bg-white/70 p-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-grass3">Burst window</div>
                <div className="mt-1 text-2xl font-bold">
                  {quota ? `${quota.rollingRemaining} / ${quota.rollingLimit} available` : "—"}
                </div>
              </div>
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-grass3">Window length</div>
                <div className="mt-1 text-2xl font-bold">
                  {quota ? `${quota.rollingWindowMs / 1000} seconds` : "—"}
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border-2 border-red bg-white p-3 text-sm font-bold text-red" role="alert">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-lg bg-grass3 px-5 py-3 font-bold text-white shadow hover:bg-grass2 disabled:cursor-wait disabled:opacity-60"
                disabled={loading || resetting}
                onClick={() => void resetQuota()}
              >
                {resetting ? "Resetting…" : "Reset daily allowance"}
              </button>
              <button
                type="button"
                className="rounded-lg border-2 border-grass3 px-5 py-3 font-bold text-grass3 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                disabled={loading || resetting}
                onClick={() => void loadQuota()}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
