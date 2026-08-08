// The complete family registry: 34 hand-built layout types plus the
// generated set pinned by families-generated.manifest.json. Family ids are
// stable forever — saved community designs reference {family, seed} recipes,
// so entries may be added here but never renamed or removed.

import type { DesignFamily } from "./families";
import { HAND_FAMILIES } from "./families";
import { GENERATED_FAMILIES } from "./families-generated";

export const DESIGN_FAMILIES: DesignFamily[] = [...HAND_FAMILIES, ...GENERATED_FAMILIES];

export const FAMILY_BY_ID = new Map(DESIGN_FAMILIES.map((family) => [family.id, family]));
