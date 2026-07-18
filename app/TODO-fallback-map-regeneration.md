# TODO: fallback map regeneration

## Problem

Some MongoDB block documents were generated from the bundled fallback map when Google Static Maps was unavailable. Their colour data, Pokémon-style sprites, and tiles therefore represent the fallback image rather than the block's real location.

The historical manual recovery instruction was:

> Because MongoDB currently contains fallback-generated blocks, switch **Regenerate On** and then reload or move one tile to trigger regeneration. Note that this can make roughly 25 Static Maps requests.

## Implemented behavior

- Treat a block generated from the fallback image as stale whenever Google Static Maps is usable.
- Recognize existing MongoDB documents by fingerprinting the original fallback image stored in their `googleMap` data, including its pre-serverless encoding.
- Tag newly generated documents with `mapSource`, `fallbackGenerated`, and `mapGeneratedAt` provenance fields.
- Bypass the normal MongoDB cache fast path when any requested cached block is a stale fallback, then queue the durable regeneration workflow.
- Automatically regenerate a stale fallback block when it is next requested; the **Regenerate On** switch is no longer required for this repair path.
- Keep the fallback marker when a Google request fails so a later request retries it.
- Do not repeatedly regenerate fallback blocks when no API key is configured or `POKEWORLD_OFFLINE_MAP=true`.

## Operational note

Regeneration remains lazy: reloading the game or moving into/requesting an affected area triggers it. A normal view can touch roughly 25 blocks, so check Google Static Maps quota and billing before intentionally sweeping a large area.

## Remaining follow-up

- [ ] Consider a rate-limited administrative workflow for proactively sweeping all fallback-derived MongoDB blocks instead of waiting for player requests.
