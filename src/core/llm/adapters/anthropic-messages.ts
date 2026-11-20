// The anthropic-messages protocol (Anthropic's Messages API), through Anthropic's SDK.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeFailure, ScanError, type ApiFailure } from "../../errors";
import { parseAnswerText } from "../../analysis/answer";
import { AnalysisResult } from "../../analysis/schema";
import { baseUrlOf } from "../providers";
import { jsonInstructions, type LlmAdapter } from "../types";

const MAX_TOKENS = 32_000;

// The SDK helper converts the Zod schema into the JSON schema the API enforces. We send only
// the schema (not the auto-parsing wrapper) because with a server-side fallback the first
// text block can be a declined, partial answer; parseFinalAnswer reads the final one.
const { type: formatType, schema: formatSchema } = betaZodOutputFormat(AnalysisResult);

export const anthropicMessages: LlmAdapter = (provider, conn) => {
  const client = new Anthropic({
    apiKey: conn.apiKey,
    baseURL: baseUrlOf(provider, conn),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
  const fail = (err: unknown, model?: string): ScanError =>
    err instanceof ScanError ? err : describeFailure(toFailure(err), { providerName: provider.name, ...(provider.local && { local: true }), ...(model && { model }) });

  return {
    async analyze({ system, docText, docTitle, instruction, signal }) {
      const model = conn.model;
      const options = signal ? { signal } : {};
      // Free, and tells us what this model accepts. If it fails, the scan below reports why.
      const info = await client.models.retrieve(model, {}, options).catch((err: unknown) => {
        if (signal?.aborted) throw fail(err);
        return null;
      });
      const structured = info?.capabilities?.structured_outputs.supported ?? true;
      // The server-side fallback retries a declined request on another model, for the models the
      // provider data lists.
      const fallback = provider.serverFallbackModels?.includes(model) ?? false;

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages
          .stream(
            {
              model,
              max_tokens: Math.min(MAX_TOKENS, info?.max_tokens ?? MAX_TOKENS),
              ...(fallback && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
              ...(structured && { output_config: { format: { type: formatType, schema: formatSchema } } }),
              system: structured ? system : system + jsonInstructions(formatSchema),
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "document", source: { type: "text", media_type: "text/plain", data: docText }, title: docTitle },
                    { type: "text", text: instruction },
                  ],
                },
              ],
            },
            options,
          )
          .finalMessage();
      } catch (err) {
        throw fail(err, model);
      }

      if (message.stop_reason === "refusal") throw new ScanError(`${provider.name} declined to analyse this document.`);
      if (message.stop_reason === "max_tokens") throw new ScanError("The analysis ran out of room before it finished. Try again.");

      return {
        result: parseFinalAnswer(message.content, provider.name),
        model: message.model,
        usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      };
    },

    async listModels(signal) {
      try {
        const models = [];
        for await (const m of client.models.list({ limit: 100 }, signal ? { signal } : {})) {
          if (m.lifecycle !== "retired") models.push({ id: m.id, label: m.display_name });
        }
        return models;
      } catch (err) {
        throw fail(err);
      }
    },
  };
};

/** With a server-side fallback, only the text after the last switch is the final answer. */
export function parseFinalAnswer(content: readonly Anthropic.Beta.BetaContentBlock[], who: string): AnalysisResult {
  const lastFallback = content.findLastIndex((b) => b.type === "fallback");
  const text = content
    .slice(lastFallback + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  return parseAnswerText(text, who);
}

function toFailure(err: unknown): ApiFailure {
  if (err instanceof Anthropic.APIUserAbortError) return { aborted: true, message: err.message };
  if (err instanceof Anthropic.APIConnectionError) return { unreachable: true, message: err.message };
  if (err instanceof Anthropic.APIError) {
    const status: unknown = err.status; // the SDK types this loosely
    return { status: typeof status === "number" ? status : undefined, message: err.message };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}
