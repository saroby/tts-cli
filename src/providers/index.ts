import { CliError } from "../shared/errors.js";
import { cartesiaAdapter } from "./cartesia.js";
import { chatterboxAdapter } from "./chatterbox.js";
import { edgeTtsAdapter } from "./edge-tts.js";
import { elevenLabsAdapter } from "./elevenlabs.js";
import { openAiAdapter } from "./openai.js";
import { typecastAdapter } from "./typecast.js";
import type { ProviderAdapter } from "./types.js";

const PROVIDERS: Record<string, ProviderAdapter> = {
  openai: openAiAdapter,
  elevenlabs: elevenLabsAdapter,
  edge: edgeTtsAdapter,
  "edge-tts": edgeTtsAdapter,
  edge_tts: edgeTtsAdapter,
  edgetts: edgeTtsAdapter,
  cartesia: cartesiaAdapter,
  typecast: typecastAdapter,
  chatterbox: chatterboxAdapter,
};

export function getProviderAdapter(provider: string): ProviderAdapter {
  const adapter = PROVIDERS[provider.toLowerCase()];
  if (!adapter) {
    throw new CliError(`Unsupported provider: ${provider}`, 1, { code: "PROVIDER_UNSUPPORTED" });
  }

  return adapter;
}
