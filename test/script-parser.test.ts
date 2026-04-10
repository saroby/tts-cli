import { describe, expect, it } from "vitest";

import { parseScript } from "../src/domain/script/parser.js";

describe("script parser", () => {
  it("preserves speech text and records speech nodes", () => {
    const parsed = parseScript(`# note
mina: (whispers) Keep your voice down.
james:  two spaces stay here.
`);

    expect(parsed.speechNodes).toEqual([
      {
        type: "speech",
        line: 2,
        actor: "mina",
        text: "(whispers) Keep your voice down.",
      },
      {
        type: "speech",
        line: 3,
        actor: "james",
        text: " two spaces stay here.",
      },
    ]);
  });

  it("rejects invalid speech lines", () => {
    expect(() => parseScript("broken line")).toThrow(
      "Invalid speech line at line 1: broken line",
    );
  });
});
