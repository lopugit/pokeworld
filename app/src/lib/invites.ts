// Client side of trainer invites: minting links for friends and resolving
// the `?invite=` parameter into the personalized PROF. OAK greeting.

export interface PublicInvite {
  id: string;
  inviteeName: string;
  inviterName: string;
}

export function inviteIdFromLocation(search: string): string | null {
  const id = new URLSearchParams(search).get("invite");
  return id && /^[A-Za-z0-9_-]{4,64}$/.test(id) ? id : null;
}

export function inviteUrlFor(origin: string, inviteId: string): string {
  return `${origin}/?invite=${encodeURIComponent(inviteId)}`;
}

const parsePublicInvite = (value: unknown): PublicInvite | null => {
  const invite = (value as { invite?: Record<string, unknown> } | null)?.invite;
  if (
    !invite ||
    typeof invite.id !== "string" ||
    typeof invite.inviteeName !== "string" ||
    typeof invite.inviterName !== "string"
  ) {
    return null;
  }
  return { id: invite.id, inviteeName: invite.inviteeName, inviterName: invite.inviterName };
};

export async function fetchInvite(id: string, signal?: AbortSignal): Promise<PublicInvite | null> {
  try {
    const response = await fetch(`/api/invites/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    return parsePublicInvite(await response.json());
  } catch {
    return null;
  }
}

export async function createInviteRequest(name: string): Promise<PublicInvite> {
  const response = await fetch("/api/invites", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "The invite could not be created");
  }
  const invite = parsePublicInvite(payload);
  if (!invite) throw new Error("Pokeworld returned an invalid invite");
  return invite;
}

/**
 * PROF. OAK's personalized welcome for an invited trainer. Every page keeps
 * to the authentic two-line GBA window (~33 characters per line), which the
 * 12-character name caps guarantee.
 */
export function inviteGreetingPages(invite: PublicInvite): string[] {
  const invitee = invite.inviteeName;
  const inviter = invite.inviterName.slice(0, 12);
  return [
    `Hi ${invitee}!\nI've been expecting you!`,
    `My name is OAK!\nPeople call me the POKéMON PROF!`,
    `${inviter} told me\nall about you.`,
    `A legendary TRAINER in the\nmaking, ${inviter} says!`,
    "And my instincts agree —\nI can already tell!",
    "This world is inhabited by\ncreatures called POKéMON!",
    `Your very own POKéMON legend is\nabout to unfold, ${invitee}!`,
    "First things first, though!\nEvery TRAINER needs a partner.",
    "Go on, pick your very first\nPOKéMON!",
  ];
}
