// ABOUTME: Small pure formatting/date helpers shared across app-UI components.
// ABOUTME: No React, no IO — kept trivially unit-testable.

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_ABBREVIATION_LENGTH = 3;

/** Today as YYYY-MM-DD in the local timezone, from an injected clock (ms epoch). */
function todayIso(nowMs: number): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "07" -> "July". Falls back to the raw token for out-of-range input. */
function monthName(monthNumber: string): string {
  const index = Number.parseInt(monthNumber, 10) - 1;
  const name = MONTH_NAMES[index];
  return name ?? monthNumber;
}

/** YYYY-MM-DD -> {year, month, day} pulled apart textually (no Date/TZ risk). */
function splitIsoDate(date: string): { year: string; month: string; day: string } | null {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  return { year, month, day };
}

/** Short human date for list rows, e.g. "Jul 15, 2026". Falls back to raw text. */
function formatDisplayDate(date: string | null): string {
  if (!date) {
    return "No date";
  }
  const parts = splitIsoDate(date);
  if (!parts) {
    return date;
  }
  const abbreviation = monthName(parts.month).slice(0, MONTH_ABBREVIATION_LENGTH);
  const dayNumber = Number.parseInt(parts.day, 10);
  return `${abbreviation} ${dayNumber}, ${parts.year}`;
}

interface Debouncer<Args extends unknown[]> {
  call: (...args: Args) => void;
  flush: () => void;
  cancel: () => void;
}

/** Debounce that keeps only the most recent call's args (last-write-wins). */
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): Debouncer<Args> {
  const box: { timer: ReturnType<typeof setTimeout> | null; pending: Args | null } = {
    timer: null,
    pending: null,
  };

  function runPending(): void {
    box.timer = null;
    const args = box.pending;
    box.pending = null;
    if (args) {
      fn(...args);
    }
  }

  return {
    call: (...args: Args) => {
      box.pending = args;
      if (box.timer !== null) {
        clearTimeout(box.timer);
      }
      box.timer = setTimeout(() => {
        runPending();
      }, delayMs);
    },
    flush: () => {
      if (box.timer !== null) {
        clearTimeout(box.timer);
        runPending();
      }
    },
    cancel: () => {
      if (box.timer !== null) {
        clearTimeout(box.timer);
        box.timer = null;
      }
      box.pending = null;
    },
  };
}

export type { Debouncer };
export { debounce, formatDisplayDate, monthName, splitIsoDate, todayIso };
