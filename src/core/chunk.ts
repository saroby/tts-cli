const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st",
  "ave", "blvd", "inc", "ltd", "corp", "dept", "est", "approx",
  "vs", "etc", "e.g", "i.e", "a.m", "p.m",
  "u.s", "u.s.a", "u.k",
]);

const PROTECTED_REGION_PATTERN = /\[[^\]]*\]|\([^)]*\)/g;
const SENTENCE_END_PATTERN = /[.!?](?:\s|$)/g;
const CJK_SENTENCE_END_PATTERN = /[。！？]/g;
const CLAUSE_BOUNDARY_PATTERN = /[;:,—](?:\s|$)/g;

interface Region { start: number; end: number; }

interface ScanContext {
  text: string;
  insideMask: Uint8Array;
  regionStarts: Set<number>;
}

export function splitText(text: string, maxChars: number): string[] {
  if (maxChars <= 0) {
    throw new Error(`splitText maxChars must be positive, got ${maxChars}`);
  }

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const ctx = buildScanContext(trimmed);
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) cursor++;
    if (cursor >= trimmed.length) break;

    const remainingLen = trimmed.length - cursor;
    if (remainingLen <= maxChars) {
      const tail = trimmed.slice(cursor).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const windowEnd = pickWindow(ctx, cursor, cursor + maxChars);
    let splitPos = findLastBoundary(ctx, cursor, windowEnd, SENTENCE_END_PATTERN, isSentenceEndAccepted);
    if (splitPos === -1) splitPos = findLastBoundary(ctx, cursor, windowEnd, CJK_SENTENCE_END_PATTERN);
    if (splitPos === -1) splitPos = findLastBoundary(ctx, cursor, windowEnd, CLAUSE_BOUNDARY_PATTERN);
    if (splitPos === -1) splitPos = findLastWhitespace(ctx, cursor, windowEnd);
    if (splitPos === -1) splitPos = windowEnd - 1;

    const chunk = trimmed.slice(cursor, splitPos + 1).trim();
    if (chunk) chunks.push(chunk);
    cursor = splitPos + 1;
  }

  return chunks;
}

function buildScanContext(text: string): ScanContext {
  const regions = collectProtectedRegions(text);
  const insideMask = new Uint8Array(text.length);
  const regionStarts = new Set<number>();
  for (const r of regions) {
    regionStarts.add(r.start);
    for (let i = r.start + 1; i < r.end; i++) {
      insideMask[i] = 1;
    }
  }
  return { text, insideMask, regionStarts };
}

function collectProtectedRegions(text: string): Region[] {
  const regions: Region[] = [];
  for (const match of text.matchAll(PROTECTED_REGION_PATTERN)) {
    regions.push({ start: match.index!, end: match.index! + match[0].length });
  }
  return regions;
}

// Pick a chunk-end position that does not bisect a protected region.
// Prefers backing up to a region's start; if backing up would leave an
// empty chunk, extends to the region's end (chunk overflows softTarget but
// the tag stays atomic).
function pickWindow(ctx: ScanContext, start: number, target: number): number {
  let end = Math.min(target, ctx.text.length);
  for (let guard = 0; guard <= ctx.regionStarts.size + 1; guard++) {
    const offender = findOffender(ctx, start, end);
    if (!offender) return Math.max(end, start + 1);
    if (offender.start <= start) {
      end = Math.min(offender.end, ctx.text.length);
    } else {
      end = offender.start;
    }
  }
  return Math.max(end, start + 1);
}

function findOffender(ctx: ScanContext, start: number, end: number): Region | null {
  if (end < ctx.text.length && ctx.insideMask[end]) {
    let regionStart = end;
    while (regionStart > start && ctx.insideMask[regionStart - 1]) regionStart--;
    let regionEnd = end;
    while (regionEnd < ctx.text.length && ctx.insideMask[regionEnd]) regionEnd++;
    return { start: regionStart - 1, end: regionEnd };
  }
  for (let i = end - 1; i >= start; i--) {
    const ch = ctx.text[i];
    if (ch !== "[" && ch !== "(") continue;
    if (ctx.regionStarts.has(i)) return null;
    const closer = ch === "[" ? "]" : ")";
    const closeIdx = ctx.text.indexOf(closer, i + 1);
    if (closeIdx === -1) return { start: i, end: ctx.text.length };
    if (closeIdx >= end) return { start: i, end: closeIdx + 1 };
    return null;
  }
  return null;
}

function findLastBoundary(
  ctx: ScanContext,
  start: number,
  end: number,
  pattern: RegExp,
  accept?: (ctx: ScanContext, pos: number) => boolean,
): number {
  let best = -1;
  const re = new RegExp(pattern.source, pattern.flags);
  re.lastIndex = start;
  for (let m = re.exec(ctx.text); m && m.index < end; m = re.exec(ctx.text)) {
    const pos = m.index;
    if (ctx.insideMask[pos]) continue;
    if (accept && !accept(ctx, pos)) continue;
    best = pos;
  }
  return best;
}

function findLastWhitespace(ctx: ScanContext, start: number, end: number): number {
  for (let i = end - 1; i >= start; i--) {
    if (/\s/.test(ctx.text[i]) && !ctx.insideMask[i]) return i;
  }
  return -1;
}

function isSentenceEndAccepted(ctx: ScanContext, pos: number): boolean {
  return ctx.text[pos] !== "." || !isAbbreviationOrDecimal(ctx.text, pos);
}

function isAbbreviationOrDecimal(text: string, dotPos: number): boolean {
  let i = dotPos - 1;
  while (i >= 0 && isAlphaOrDot(text.charCodeAt(i))) i--;
  const word = text.slice(i + 1, dotPos).toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;
  if (i >= 0 && isDigit(text.charCodeAt(i))) return true;
  return false;
}

function isAlphaOrDot(code: number): boolean {
  return code === 0x2e || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}
