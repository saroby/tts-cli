import type { ActorCatalogState, ResolvedActor } from "../domain/actor/types.js";
import type { RunExecutionResult, RunManifest, SayExecutionResult, SayPreview } from "../core/tts.js";

export function formatActorList(
  actors: ResolvedActor[],
  options: {
    actorStates?: Record<string, ActorCatalogState>;
    includeHiddenState?: boolean;
  } = {},
): string {
  if (actors.length === 0) {
    return "No actors found.";
  }

  const rows = actors.map((actor) => {
    const actorState = options.actorStates?.[actor.name];
    const note = options.includeHiddenState && actorState?.hidden
      ? `hidden${actorState.reason ? `: ${actorState.reason}` : ""}`
      : "";

    return [
      actor.name,
      actor.provider,
      actor.model,
      actor.voice,
      note,
    ];
  });
  const widths = [0, 0, 0, 0, 0];
  const includeNotes = rows.some((row) => row[4] !== "");

  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }

  const lines = rows.map(
    (row) =>
      includeNotes
        ? `  ${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2].padEnd(
            widths[2],
          )}  ${row[3].padEnd(widths[3])}${row[4] ? `  ${row[4]}` : ""}`
        : `  ${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2].padEnd(
            widths[2],
          )}  ${row[3]}`,
  );

  return ["Available actors", "", ...lines].join("\n");
}

export function formatActorDetails(
  actor: ResolvedActor,
  actorState?: ActorCatalogState,
): string {
  const lines = [
    `name: ${actor.name}`,
    `provider: ${actor.provider}`,
    `model: ${actor.model}`,
    `voice: ${actor.voice}`,
  ];

  if (actorState?.hidden) {
    lines.push("hidden: true");
    if (actorState.reason) {
      lines.push(`hidden_reason: ${actorState.reason}`);
    }
  }

  if (actor.locale) {
    lines.push(`locale: ${actor.locale}`);
  }

  if (actor.synthesis && Object.keys(actor.synthesis).length > 0) {
    lines.push("", "synthesis");
    for (const [key, value] of Object.entries(actor.synthesis)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }

  if (actor.providerOptions && Object.keys(actor.providerOptions).length > 0) {
    lines.push("", "provider_options");
    for (const [key, value] of Object.entries(actor.providerOptions)) {
      lines.push(`  ${key}: ${formatScalar(value)}`);
    }
  }

  return lines.join("\n");
}

export function formatSayPreview(result: SayPreview): string {
  return [
    `actor: ${result.actor}`,
    `provider: ${result.provider}`,
    `model: ${result.model}`,
    `voice: ${result.voice}`,
    `format: ${result.format}`,
    `text: ${result.text}`,
    "",
    "request",
    formatPreviewBlock(result.request),
  ].join("\n");
}

export function formatSayResult(result: SayExecutionResult): string {
  return [
    `actor: ${result.actor}`,
    `provider: ${result.provider}`,
    `file: ${result.file}`,
  ].join("\n");
}

export function formatRunManifest(manifest: RunManifest): string {
  const lines = [`source: ${manifest.source}`];

  for (const item of manifest.items) {
    lines.push(
      "",
      `${String(item.index).padStart(4, "0")} ${item.actor} ${item.status}${
        item.file ? ` ${item.file}` : ""
      }`,
      `  ${item.text}`,
    );

    if (item.error) {
      lines.push(`  error: ${item.error}`);
    }
  }

  return lines.join("\n");
}

export function formatRunSummary(result: RunExecutionResult): string {
  let okCount = 0;
  let errorCount = 0;
  for (const item of result.manifest.items) {
    if (item.status === "ok") okCount++;
    else if (item.status === "error") errorCount++;
  }
  const lines = [
    `items: ${result.manifest.items.length}`,
    `ok: ${okCount}`,
    `error: ${errorCount}`,
  ];

  if (result.manifestPath) {
    lines.push(`manifest: ${result.manifestPath}`);
  }

  return lines.join("\n");
}

function formatPreviewBlock(preview: SayPreview["request"]): string {
  const lines: string[] = [];

  if (preview.method) {
    lines.push(`  method: ${preview.method}`);
  }

  if (preview.url) {
    lines.push(`  url: ${preview.url}`);
  }

  if (preview.command) {
    lines.push(`  command: ${preview.command.join(" ")}`);
  }

  if (preview.headers) {
    lines.push("  headers:");
    for (const [key, value] of Object.entries(preview.headers)) {
      lines.push(`    ${key}: ${value}`);
    }
  }

  if (preview.body !== undefined) {
    lines.push("  body:");
    for (const line of JSON.stringify(preview.body, null, 2).split("\n")) {
      lines.push(`    ${line}`);
    }
  }

  if (preview.notes && preview.notes.length > 0) {
    lines.push("  notes:");
    for (const note of preview.notes) {
      lines.push(`    - ${note}`);
    }
  }

  return lines.join("\n");
}

function formatScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
