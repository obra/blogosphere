// ABOUTME: Unit tests for splitIsoDate/formatDisplayDate — including the
// ABOUTME: legacy .html corpus's full-timestamp date-field shape.
import { describe, expect, it } from "vitest";
import { formatDisplayDate, splitIsoDate } from "./format";

describe("splitIsoDate", () => {
  it("parses a bare YYYY-MM-DD", () => {
    expect(splitIsoDate("2026-07-15")).toEqual({ year: "2026", month: "07", day: "15" });
  });

  it("parses the leading YYYY-MM-DD out of a full LiveJournal-export timestamp", () => {
    // Real shape from content/blog/2004/2004-01-24-orkut.html's front matter.
    expect(splitIsoDate("2004-01-24 00:04:00.000000000 -08:00")).toEqual({
      year: "2004",
      month: "01",
      day: "24",
    });
  });

  it("parses an ISO 8601 'T' separator too", () => {
    expect(splitIsoDate("2026-07-15T09:30:00Z")).toEqual({ year: "2026", month: "07", day: "15" });
  });

  it("returns null for a non-date-shaped string", () => {
    expect(splitIsoDate("not a date")).toBeNull();
  });

  it("returns null when digits follow the day with no separator (not a real date boundary)", () => {
    expect(splitIsoDate("2026-07-155")).toBeNull();
  });
});

describe("formatDisplayDate", () => {
  it("formats a bare date as an abbreviated human date", () => {
    expect(formatDisplayDate("2026-07-15")).toBe("Jul 15, 2026");
  });

  it("formats a legacy full-timestamp date the same as its bare-date equivalent", () => {
    expect(formatDisplayDate("2004-01-24 00:04:00.000000000 -08:00")).toBe("Jan 24, 2004");
  });

  it("falls back to 'No date' for null", () => {
    expect(formatDisplayDate(null)).toBe("No date");
  });

  it("falls back to the raw string for something unparseable", () => {
    expect(formatDisplayDate("garbage")).toBe("garbage");
  });
});
