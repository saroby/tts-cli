import { describe, expect, it } from "vitest";

import { clampCursor, selectInteractiveOutput } from "../src/cli/interactive-picker.js";

describe("interactive picker helpers", () => {
  it("keeps the cursor at zero when the filtered list is empty", () => {
    expect(clampCursor(1, 0)).toBe(0);
    expect(clampCursor(-1, 0)).toBe(0);
  });

  it("clamps the cursor within the filtered list bounds", () => {
    expect(clampCursor(-3, 4)).toBe(0);
    expect(clampCursor(2, 4)).toBe(2);
    expect(clampCursor(9, 4)).toBe(3);
  });

  it("prefers stderr when choosing a TTY output stream", () => {
    const stderr = { isTTY: true } as NodeJS.WriteStream;
    const stdout = { isTTY: true } as NodeJS.WriteStream;

    expect(selectInteractiveOutput({ stderr, stdout })).toBe(stderr);
  });

  it("falls back to stdout when stderr is not a TTY", () => {
    const stderr = { isTTY: false } as NodeJS.WriteStream;
    const stdout = { isTTY: true } as NodeJS.WriteStream;

    expect(selectInteractiveOutput({ stderr, stdout })).toBe(stdout);
  });

  it("throws when no writable TTY stream is available", () => {
    const stderr = { isTTY: false } as NodeJS.WriteStream;
    const stdout = { isTTY: false } as NodeJS.WriteStream;

    expect(() => selectInteractiveOutput({ stderr, stdout })).toThrow(
      "Interactive picker requires a TTY output stream.",
    );
  });
});
