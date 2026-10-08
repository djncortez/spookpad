import { publicEnv } from "./env";

// Original and costume images live in the public "art" Storage bucket.
export const artUrl = (path: string | null | undefined, base: string = publicEnv.supabaseUrl): string | null =>
  path ? `${base.replace(/\/+$/, "")}/storage/v1/object/public/art/${path}` : null;
