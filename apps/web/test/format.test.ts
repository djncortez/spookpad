import { expect, test } from "vitest";
import { artUrl } from "../lib/art";
import { formatUsd, shortAddress, solText, timeAgo } from "../lib/format";

test("formats", () => {
  expect(shortAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("7xKX…gAsU");
  expect(formatUsd(null)).toBe("—");
  expect(formatUsd(950)).toBe("$950");
  expect(formatUsd(12_345)).toBe("$12.3K");
  expect(formatUsd(4_560_000)).toBe("$4.56M");
  expect(solText(20_000_000)).toBe("0.02 SOL");
  const now = Date.parse("2026-10-08T12:00:00Z");
  expect(timeAgo("2026-10-08T11:59:30Z", now)).toBe("just now");
  expect(timeAgo("2026-10-08T11:15:00Z", now)).toBe("45m ago");
  expect(timeAgo("2026-10-08T07:00:00Z", now)).toBe("5h ago");
  expect(timeAgo("2026-10-05T12:00:00Z", now)).toBe("3d ago");
});

test("art paths become public Storage URLs", () => {
  expect(artUrl("costumes/a.png", "https://p.supabase.co/")).toBe("https://p.supabase.co/storage/v1/object/public/art/costumes/a.png");
  expect(artUrl(null, "https://p.supabase.co")).toBeNull();
});
