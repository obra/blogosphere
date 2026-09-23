// ABOUTME: How long the macOS HUD shows a notice: long enough to read, so
// ABOUTME: longer messages stay twice as long.

const SHORT_MS = 2000;
const LONG_MS = 4000;
const LONG_MESSAGE = 60;

function hudDuration(message: string): number {
  return message.length > LONG_MESSAGE ? LONG_MS : SHORT_MS;
}

export { hudDuration };
