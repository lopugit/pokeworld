import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";

function UserAvatar({ avatarUrl, username }: { avatarUrl?: string; username: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 rounded-full border-2 border-white/70 object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/70 bg-grass3 text-sm font-bold uppercase"
    >
      {username.slice(0, 1)}
    </span>
  );
}

export function AuthControls() {
  const { busy, error, login, logout, session, status } = useAuth();

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
      {status === "loading" ? (
        <span className="text-sm font-semibold text-white/80" role="status">
          Checking login…
        </span>
      ) : session.authenticated ? (
        <>
          {session.isAdmin ? (
            <Link className="rounded-md px-2 py-2 text-sm font-bold hover:bg-white/10" to="/admin">
              Admin
            </Link>
          ) : null}
          <span className="flex min-w-0 items-center gap-2" title={session.user.displayName || session.user.username}>
            <UserAvatar avatarUrl={session.user.avatarUrl} username={session.user.username} />
            <span className="max-w-28 truncate text-sm font-bold sm:max-w-40">@{session.user.username}</span>
          </span>
          <button
            type="button"
            className="rounded-md border border-white/70 px-3 py-2 text-sm font-bold hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
            disabled={busy}
            onClick={() => void logout().catch(() => undefined)}
          >
            Log out
          </button>
        </>
      ) : (
        <button
          type="button"
          className="rounded-md border border-white bg-white px-3 py-2 text-sm font-bold text-grass3 shadow-sm hover:bg-teal disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          onClick={() => void login().catch(() => undefined)}
        >
          {busy ? "Opening Thingtime…" : "Login with Thingtime"}
        </button>
      )}
      {error ? (
        <span className="basis-full text-right text-xs font-semibold text-white" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
