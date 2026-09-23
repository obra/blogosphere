// ABOUTME: Every semantic icon resolves on every platform: an SF Symbol name
// ABOUTME: for Apple and a real Lucide component for everything else.
import { describe, expect, it } from "vitest";
import { ICONS } from "./iconNames";

const SF_SYMBOL_NAME = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

describe("ICONS", () => {
  const entries = Object.entries(ICONS);

  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s has an SF Symbol name and a Lucide component", (_name, source) => {
    expect(source.sfSymbol).toMatch(SF_SYMBOL_NAME);
    expect(source.lucide).toBeTruthy();
  });
});
