import { describe, expect, it } from "vitest";

import { splitText } from "../src/core/chunk.js";

describe("splitText", () => {
  it("returns empty array for empty input", () => {
    expect(splitText("", 100)).toEqual([]);
    expect(splitText("   \n\t", 100)).toEqual([]);
  });

  it("returns single chunk when text fits within maxChars", () => {
    expect(splitText("Hello world.", 100)).toEqual(["Hello world."]);
  });

  it("rejects non-positive maxChars", () => {
    expect(() => splitText("hi", 0)).toThrow();
    expect(() => splitText("hi", -1)).toThrow();
  });

  it("splits at sentence boundary", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const chunks = splitText(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25);
    }
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("does not split after common abbreviations when an earlier sentence end is available", () => {
    const text = "Hello there! Mr. Smith said hi to Dr. Jones at U.S. base.";
    const chunks = splitText(text, 30);
    expect(chunks[0]).toBe("Hello there!");
    expect(chunks[1]).toMatch(/^Mr\. Smith/);
    expect(chunks[1]).not.toMatch(/Mr\.$/);
  });

  it("treats U.S. as an abbreviation, not a sentence end", () => {
    const text = "Wow! Visiting the U.S. capital was great. Truly amazing trip.";
    const chunks = splitText(text, 35);
    const usEndsChunk = chunks.some((c) => /\bU\.S\.$/.test(c));
    expect(usEndsChunk).toBe(false);
  });

  it("does not split inside decimal numbers", () => {
    const text = "The price is 3.14 dollars and the rate is 2.71 percent today.";
    const chunks = splitText(text, 35);
    expect(chunks[0]).not.toMatch(/\d\.$/);
  });

  it("respects CJK sentence endings", () => {
    const text = "안녕하세요。반갑습니다。오늘은 맑은 날입니다。내일도 그러길 바랍니다。";
    const chunks = splitText(text, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it("does not split inside [bracket] tags", () => {
    const text = "Hello there [a very long laughing tag here] and goodbye now everyone.";
    const chunks = splitText(text, 30);
    for (const chunk of chunks) {
      const opens = (chunk.match(/\[/g) ?? []).length;
      const closes = (chunk.match(/\]/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it("does not split inside (paren) tags (ElevenLabs convention)", () => {
    const text = "Then she said (whispers very quietly here) keep your voice down please everyone.";
    const chunks = splitText(text, 35);
    for (const chunk of chunks) {
      const opens = (chunk.match(/\(/g) ?? []).length;
      const closes = (chunk.match(/\)/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it("falls back to clause boundary when no sentence end is in window", () => {
    const text = "this is one long clause; followed by another clause; and yet another piece of text";
    const chunks = splitText(text, 35);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("falls back to whitespace when no punctuation is available", () => {
    const text = "word ".repeat(20).trim();
    const chunks = splitText(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25);
      expect(chunk.startsWith(" ")).toBe(false);
      expect(chunk.endsWith(" ")).toBe(false);
    }
  });

  it("hard-cuts only when no boundary is available", () => {
    const text = "x".repeat(50);
    const chunks = splitText(text, 10);
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("preserves the original text when joined", () => {
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
    const chunks = splitText(text, 25);
    const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
    expect(joined).toBe(text);
  });
});
