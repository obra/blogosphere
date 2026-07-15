// ABOUTME: Fidelity check — fakeModel's path/slug/permalink behavior must
// ABOUTME: agree with the real model (core/model), since it now delegates
// ABOUTME: directly to core/model/paths.ts instead of reimplementing it.
import { describe, expect, it } from "vitest";
import { createModel } from "../../../core/model";
import { createFakeModel } from "./fakeModel";

describe("fakeModel path/slug rules agree with the real model", () => {
  it("slugify preserves author-typed case, exactly like the real model", () => {
    const real = createModel();
    const fake = createFakeModel();
    for (const title of ["My New Draft", "I started a company", "Direct Post"]) {
      expect(fake.slugify(title)).toBe(real.slugify(title));
    }
    // Pin the actual (case-preserving) shape too, not just cross-agreement —
    // a bug that lowercased both sides identically would still pass the
    // loop above.
    expect(fake.slugify("My New Draft")).toBe("My-New-Draft");
  });

  it("pathParts accepts a capitalized slug, exactly like the real model", () => {
    const real = createModel();
    const fake = createFakeModel();
    const path = "content/blog/2026/2026-03-01-My-New-Draft.md";
    expect(fake.pathParts(path)).toEqual(real.pathParts(path));
    expect(fake.pathParts(path)).not.toBeNull();
  });

  it("permalinkFor agrees for a capitalized-slug entry", () => {
    const real = createModel();
    const fake = createFakeModel();
    const rawEntry = {
      path: "content/blog/2026/2026-03-01-My-New-Draft.md",
      kind: "post" as const,
      raw: "",
      frontMatterText: "",
      body: "",
      title: "My New Draft",
      date: "2026-03-01",
      tags: [],
      draft: false,
      opaqueId: null,
      url: null,
      type: null,
      unknownKeys: [],
    };
    expect(fake.permalinkFor(rawEntry)).toBe(real.permalinkFor(rawEntry));
    expect(fake.permalinkFor(rawEntry)).toBe("/2026/03/01/My-New-Draft/");
  });
});
