import { resolve } from "node:path";

import { CliError } from "../../shared/errors.js";
import { readUtf8File } from "../../shared/fs.js";
import type { CommentNode, ParsedScript, ScriptNode, SpeechNode } from "./types.js";

export function parseScript(source: string, sourcePath?: string): ParsedScript {
  const nodes: ScriptNode[] = [];
  const speechNodes: SpeechNode[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      continue;
    }

    if (line.trimStart().startsWith("#")) {
      const comment: CommentNode = {
        type: "comment",
        line: lineNumber,
        value: line.trimStart().slice(1).trimStart(),
      };
      nodes.push(comment);
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      throw new CliError(formatScriptError(sourcePath, lineNumber, line), 1, { code: "SCRIPT_PARSE_ERROR" });
    }

    const actor = line.slice(0, separatorIndex).trim();
    if (actor === "") {
      throw new CliError(formatScriptError(sourcePath, lineNumber, line), 1, { code: "SCRIPT_PARSE_ERROR" });
    }

    let text = line.slice(separatorIndex + 1);
    if (text.startsWith(" ")) {
      text = text.slice(1);
    }

    const speech: SpeechNode = {
      type: "speech",
      line: lineNumber,
      actor,
      text,
    };

    nodes.push(speech);
    speechNodes.push(speech);
  }

  return {
    sourcePath,
    nodes,
    speechNodes,
  };
}

export async function parseScriptFile(path: string): Promise<ParsedScript> {
  const sourcePath = resolve(path);
  const source = await readUtf8File(sourcePath);
  return parseScript(source, sourcePath);
}

function formatScriptError(
  sourcePath: string | undefined,
  lineNumber: number,
  line: string,
): string {
  const prefix = sourcePath ? `${sourcePath}:${lineNumber}` : `line ${lineNumber}`;
  return `Invalid speech line at ${prefix}: ${line}`;
}
