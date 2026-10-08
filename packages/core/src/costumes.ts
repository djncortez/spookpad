// The Halloween costumes (spec §5). The database's `costumes` table holds the live prompts (editable on the admin
// page); SEED_COSTUMES is what the migration inserts. A full prompt is the shared rule plus one costume line.
export const COSTUME_SLUG = /^[a-z]{2,20}$/;
export const DEFAULT_COSTUME = "ghost";

export const SHARED_RULE =
  "Edit this image. Keep the character exactly the same: same face, colors, art style, line work, proportions, pose and " +
  "background. Do not add text or watermarks. Only add the following Halloween costume, drawn in the image's own art " +
  "style so it looks like it belongs:";

export interface SeedCostume { slug: string; label: string; emoji: string; prompt: string; sort: number }

export const SEED_COSTUMES: SeedCostume[] = [
  { slug: "ghost", label: "Ghost sheet", emoji: "👻", sort: 1,
    prompt: "a white bedsheet ghost costume draped over the character's body and head, with two cut-out eye holes showing the character's own eyes, the sheet's folds following its shape" },
  { slug: "witch", label: "Witch", emoji: "🧙", sort: 2, prompt: "a black pointy witch hat and a dark purple cape" },
  { slug: "vampire", label: "Vampire", emoji: "🧛", sort: 3, prompt: "a high-collared black and red vampire cape and small fangs" },
  { slug: "pumpkin", label: "Pumpkin head", emoji: "🎃", sort: 4,
    prompt: "a carved jack-o'-lantern worn as a helmet over the head, the face visible through the carved opening" },
  { slug: "mummy", label: "Mummy", emoji: "🧟", sort: 5, prompt: "loose white bandage wrappings around the body and head, the eyes still visible" },
  { slug: "skeleton", label: "Skeleton", emoji: "💀", sort: 6, prompt: "a black skeleton costume suit with white bones printed on it" },
  { slug: "devil", label: "Devil", emoji: "😈", sort: 7, prompt: "small red devil horns, a red cape and a pointed tail" },
];

export const buildPrompt = (costumePrompt: string): string => `${SHARED_RULE} ${costumePrompt.trim()}.`;

export interface CostumePatch { label?: string; emoji?: string; prompt?: string; enabled?: boolean }

export function checkCostumePatch(patch: unknown): { ok: true; changed: CostumePatch } | { ok: false; error: string } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return { ok: false, error: "Send the changes as an object." };
  const changed: CostumePatch = {};
  for (const [k, v] of Object.entries(patch)) {
    const text = typeof v === "string" ? v.trim() : null;
    if (k === "prompt") {
      if (text === null || text.length < 10 || text.length > 600) return { ok: false, error: "The costume line must be 10 to 600 characters." };
      changed.prompt = text;
    } else if (k === "label") {
      if (text === null || text.length < 1 || text.length > 24) return { ok: false, error: "The label must be 1 to 24 characters." };
      changed.label = text;
    } else if (k === "emoji") {
      if (text === null || text.length < 1 || text.length > 8) return { ok: false, error: "The emoji must be 1 to 8 characters." };
      changed.emoji = text;
    } else if (k === "enabled") {
      if (typeof v !== "boolean") return { ok: false, error: "enabled must be true or false." };
      changed.enabled = v;
    } else {
      return { ok: false, error: `Unknown field: ${k}.` };
    }
  }
  return { ok: true, changed };
}
