export type ScriptNode = SpeechNode | CommentNode;

export interface SpeechNode {
  type: "speech";
  line: number;
  actor: string;
  text: string;
}

export interface CommentNode {
  type: "comment";
  line: number;
  value: string;
}

export interface ParsedScript {
  sourcePath?: string;
  nodes: ScriptNode[];
  speechNodes: SpeechNode[];
}
