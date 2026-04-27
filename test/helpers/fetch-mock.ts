import { vi } from "vitest";

export interface JsonBodyCapture<TBody = Record<string, unknown>> {
  bodies: TBody[];
  fetchMock: ReturnType<typeof vi.fn>;
}

export function captureJsonBodies<TBody = Record<string, unknown>>(
  responder: (call: number) => Uint8Array,
  contentType = "audio/mpeg",
): JsonBodyCapture<TBody> {
  const bodies: TBody[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as TBody);
    return new Response(responder(call++), { headers: { "content-type": contentType } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { bodies, fetchMock };
}
