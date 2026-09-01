import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createInviteRequest, inviteUrlFor, type PublicInvite } from "../lib/invites";

/**
 * Invite a friend by name: mints a shareable link whose opener gets a
 * personalized PROF. OAK welcome ("<inviter> told me all about you...").
 * Only signed-in trainers can mint; everyone else sees a login nudge.
 */
export function InvitePanel() {
  const { login, session, status } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = invite ? inviteUrlFor(window.location.origin, invite.id) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setInvite(await createInviteRequest(name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invite could not be created");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link stays selectable in the read-only input below.
    }
  };

  return (
    <section className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white/95 p-6 shadow-md">
      <h2 className="text-xl font-bold text-grass3">Invite a friend</h2>
      <p className="mt-1 text-sm text-gray-600">
        PROF. OAK will greet them by name and mention that you sent them.
      </p>
      {status !== "authenticated" || !session.authenticated ? (
        <button
          type="button"
          className="mt-4 rounded-md bg-grass px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-grass3"
          onClick={() => void login().catch(() => undefined)}
        >
          Login with Thingtime to invite friends
        </button>
      ) : (
        <>
          <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={submit}>
            <input
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-grass focus:outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={12}
              placeholder="Friend's name (e.g. ASH)"
              aria-label="Friend's name"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button
              type="submit"
              className="rounded-md bg-grass px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-grass3 disabled:cursor-wait disabled:opacity-60"
              disabled={busy || !name.trim()}
            >
              {busy ? "Minting…" : "Create invite"}
            </button>
          </form>
          {error ? (
            <p className="mt-2 text-sm font-semibold text-red" role="alert">
              {error}
            </p>
          ) : null}
          {invite && inviteUrl ? (
            <div className="mt-4 rounded-md border border-grass/40 bg-teal/20 p-3">
              <p className="text-sm text-gray-700">
                Invite for <span className="font-bold">{invite.inviteeName}</span> is ready — share
                this link:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs"
                  value={inviteUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Invite link"
                />
                <button
                  type="button"
                  className="rounded-md border border-grass px-3 py-2 text-sm font-bold text-grass3 hover:bg-grass hover:text-white"
                  onClick={() => void copy()}
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
