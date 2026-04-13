import type { ResolvedActor } from "../domain/actor/types.js";

type PickerResult =
  | { type: "selected"; actor: ResolvedActor }
  | { type: "cancelled" };

interface PickerCallbacks {
  onPreview: (actor: ResolvedActor) => Promise<void>;
}

interface InteractiveOutputStreams {
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}

export function clampCursor(cursor: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(cursor, itemCount - 1));
}

export function selectInteractiveOutput(
  streams: InteractiveOutputStreams = process,
): NodeJS.WriteStream {
  if (streams.stderr.isTTY) {
    return streams.stderr;
  }

  if (streams.stdout.isTTY) {
    return streams.stdout;
  }

  throw new Error("Interactive picker requires a TTY output stream.");
}

export async function interactivePicker(
  actors: ResolvedActor[],
  callbacks: PickerCallbacks,
): Promise<PickerResult> {
  if (actors.length === 0) {
    return { type: "cancelled" };
  }

  const output = selectInteractiveOutput();
  const write = (s: string) => output.write(s);

  let cursor = 0;
  let filterText = "";
  let filtered = actors;
  let status = "";
  let filterMode = false;
  let previewing = false;
  let nameW = Math.max(...actors.map((a) => a.name.length), 4);
  let provW = Math.max(...actors.map((a) => a.provider.length), 8);

  const pageSize = Math.max(1, (output.rows || 24) - 7);

  function getVisible(): { items: ResolvedActor[]; offset: number } {
    const half = Math.floor(pageSize / 2);
    let offset = cursor - half;
    if (offset < 0) offset = 0;
    if (offset + pageSize > filtered.length) {
      offset = Math.max(0, filtered.length - pageSize);
    }
    return { items: filtered.slice(offset, offset + pageSize), offset };
  }

  function render() {
    const { items, offset } = getVisible();
    const cols = output.columns || 80;

    write("\x1b[?25l\x1b[2J\x1b[H");

    write("\x1b[1mActor Preview\x1b[0m\n");

    if (filterMode) {
      write(`\x1b[33m/ ${filterText}\x1b[0m\n`);
    } else {
      write("\x1b[2m\u2191\u2193 move  / filter  space preview  enter select  q quit\x1b[0m\n");
    }
    write("\n");

    for (let i = 0; i < items.length; i++) {
      const actor = items[i];
      const idx = offset + i;
      const selected = idx === cursor;
      const prefix = selected ? "\x1b[7m" : "";
      const suffix = selected ? "\x1b[0m" : "";
      const line = `  ${actor.name.padEnd(nameW)}  ${actor.provider.padEnd(provW)}  ${actor.voice}`;
      write(`${prefix}${line.slice(0, cols)}${suffix}\n`);
    }

    if (filtered.length > pageSize) {
      write(`\n\x1b[2m  ${cursor + 1}/${filtered.length}\x1b[0m`);
    }

    if (status) {
      write(`\n\x1b[2m  ${status}\x1b[0m`);
    }

    write("\n");
  }

  function applyFilter() {
    if (filterText === "") {
      filtered = actors;
    } else {
      const lower = filterText.toLowerCase();
      filtered = actors.filter(
        (a) =>
          a.name.toLowerCase().includes(lower) ||
          a.provider.toLowerCase().includes(lower) ||
          a.voice.toLowerCase().includes(lower) ||
          (a.locale?.toLowerCase().includes(lower) ?? false),
      );
    }
    cursor = clampCursor(cursor, filtered.length);
    nameW = Math.max(...filtered.map((a) => a.name.length), 4);
    provW = Math.max(...filtered.map((a) => a.provider.length), 8);
  }

  return new Promise<PickerResult>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      stdin.removeListener("data", onData);
      write("\x1b[?25h\x1b[2J\x1b[H");
    }

    async function onData(data: string) {
      if (previewing) return;

      // Filter mode input
      if (filterMode) {
        if (data === "\r" || data === "\n" || data === "\x1b") {
          filterMode = false;
          render();
          return;
        }
        if (data === "\x7f" || data === "\b") {
          filterText = filterText.slice(0, -1);
          applyFilter();
          render();
          return;
        }
        if (data.length === 1 && data >= " ") {
          filterText += data;
          applyFilter();
          render();
          return;
        }
        return;
      }

      // Normal mode
      if (data === "q" || data === "\x1b") {
        cleanup();
        resolve({ type: "cancelled" });
        return;
      }

      if (data === "\r" || data === "\n") {
        if (filtered.length > 0) {
          const actor = filtered[cursor];
          if (!actor) {
            render();
            return;
          }
          cleanup();
          resolve({ type: "selected", actor });
        }
        return;
      }

      if (data === "/") {
        filterMode = true;
        render();
        return;
      }

      if (data === " ") {
        if (filtered.length > 0) {
          const actor = filtered[cursor];
          if (!actor) {
            render();
            return;
          }
          previewing = true;
          status = `previewing ${actor.name}...`;
          render();
          try {
            await callbacks.onPreview(actor);
            status = `played ${actor.name}`;
          } catch (err) {
            status = `error: ${err instanceof Error ? err.message : String(err)}`;
          }
          previewing = false;
          render();
        }
        return;
      }

      // Arrow keys (escape sequences)
      if (data === "\x1b[A" || data === "k") {
        cursor = clampCursor(cursor - 1, filtered.length);
        render();
        return;
      }
      if (data === "\x1b[B" || data === "j") {
        cursor = clampCursor(cursor + 1, filtered.length);
        render();
        return;
      }
      // Page up/down
      if (data === "\x1b[5~") {
        cursor = clampCursor(cursor - pageSize, filtered.length);
        render();
        return;
      }
      if (data === "\x1b[6~") {
        cursor = clampCursor(cursor + pageSize, filtered.length);
        render();
        return;
      }
    }

    stdin.on("data", onData);
    render();
  });
}
