// The admin page is one plain HTML file; its settings parsing sits between markers so it can be tested here.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const html = readFileSync("apps/web/admin/index.html", "utf8");
const block = html.slice(html.indexOf("// ===== field parsing ====="), html.indexOf("// ===== end field parsing ====="));
const { parseField, costumeFeeWarning } = new Function(`${block}; return { parseField, costumeFeeWarning };`)() as {
  parseField(kind: string, label: string, text: string): number;
  costumeFeeWarning(text: string): string;
};

describe("admin settings parsing", () => {
  test("parses SOL, dollars and whole numbers", () => {
    expect(parseField("sol", "Costume fee (SOL)", " 0.001 ")).toBe(1_000_000);
    expect(parseField("sol", "Costume fee (SOL)", "0")).toBe(0);
    expect(parseField("usd", "Minimum credit ($)", "2.5")).toBe(2.5);
    expect(parseField("usd", "Minimum credit ($)", "0")).toBe(0);
    expect(parseField("int", "Per hour", "20")).toBe(20);
  });
  test("refuses empty inputs with a message naming the field (an empty $ field used to save 0)", () => {
    expect(() => parseField("usd", "Minimum credit ($)", "  ")).toThrow(/Minimum credit \(\$\): enter/);
    expect(() => parseField("sol", "Launch fee (SOL)", "")).toThrow(/Launch fee \(SOL\): enter/);
    expect(() => parseField("int", "Per hour", "")).toThrow(/Per hour: enter/);
  });
  test("refuses anything that isn't strictly a number", () => {
    for (const bad of ["12abc", "1e3", "-1", "0x10", "1.5", "Infinity", "NaN"]) {
      expect(() => parseField("int", "Per hour", bad), bad).toThrow(/Per hour/);
    }
    for (const bad of ["2abc", "1e2", "-2", "2.555", ".5", "$2"]) {
      expect(() => parseField("usd", "Minimum credit ($)", bad), bad).toThrow(/Minimum credit/);
    }
    for (const bad of ["0.5 SOL", "1e9", "-0.1", "0.0000000001"]) {
      expect(() => parseField("sol", "Launch fee (SOL)", bad), bad).toThrow(/Launch fee/);
    }
  });
  test("warns when costumes are free", () => {
    expect(costumeFeeWarning("0")).toMatch(/anyone can generate costumes for free, which spends your OpenRouter credit/);
    expect(costumeFeeWarning("0.000")).toMatch(/for free/);
    expect(costumeFeeWarning("0.001")).toBe("");
    expect(costumeFeeWarning("abc")).toBe("");
  });
});
