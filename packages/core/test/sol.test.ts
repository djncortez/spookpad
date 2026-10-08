import { describe, expect, test } from "vitest";
import { lamportsToSol, solToLamports } from "@spookpad/core/sol";

describe("solToLamports", () => {
  test("converts decimal SOL exactly", () => {
    expect(solToLamports("0.05")).toBe(50_000_000);
    expect(solToLamports("1")).toBe(1_000_000_000);
    expect(solToLamports("0.000000001")).toBe(1);
    expect(solToLamports(" 2.5 ")).toBe(2_500_000_000);
  });
  test("refuses anything that is not a plain SOL amount with up to 9 decimals", () => {
    for (const bad of ["", "-1", "abc", "1.0000000001", "1e3", "0x10", "1,5"]) {
      expect(() => solToLamports(bad)).toThrow(/Not a SOL amount/);
    }
  });
});

describe("lamportsToSol", () => {
  test("prints the shortest exact decimal", () => {
    expect(lamportsToSol(50_000_000)).toBe("0.05");
    expect(lamportsToSol(1_000_000_000)).toBe("1");
    expect(lamportsToSol(1)).toBe("0.000000001");
    expect(lamportsToSol(0)).toBe("0");
  });
  test("round-trips", () => {
    for (const n of [0, 1, 5_000, 123_456_789, 10_000_000_001]) expect(solToLamports(lamportsToSol(n))).toBe(n);
  });
});
