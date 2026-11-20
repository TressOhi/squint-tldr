// The openai-chat protocol (the OpenAI Chat Completions API, which many providers and local
// servers implement), through OpenAI's SDK pointed at the provider's endpoint.
import OpenAI from "openai";
import { describeFailure, ScanError, type ApiFailure } from "../../errors";
import { parseAnswerText } from "../../analysis/answer";
import { ANALYSIS_JSON_SCHEMA } from "../../analysis/schema";
import { baseUrlOf } from "../providers";
import { jsonInstructions, type LlmAdapter } from "../types";

export const openAiChat: LlmAdapter = (provider, conn) => {
  const client = new OpenAI({
    // Local servers don't check the key, but the SDK requires one.
    apiKey: conn.apiKey || "not-needed",
    baseURL: baseUrlOf(provider, conn),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
  const context = { providerName: provider.name, ...(provider.local && { local: true }) };
  const fail = (err: unknown, model?: string): ScanError =>
    err instanceof ScanError ? err : describeFailure(toFailure(err), { ...context, ...(model && { model }) });

  return {
    async analyze({ system, docText, docTitle, instruction, signal }) {
      const model = conn.model;
      const options = signal ? { signal } : {};
      const user = `<document title="${docTitle.replace(/"/g, "'")}">\n${docText}\n</document>\n\n${instruction}`;

      const request = (structured: boolean) =>
        client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: structured ? system : system + jsonInstructions(ANALYSIS_JSON_SCHEMA) },
              { role: "user", content: user },
            ],
            ...(structured && {
              response_format: { type: "json_schema", json_schema: { name: "policy_analysis", strict: true, schema: ANALYSIS_JSON_SCHEMA } },
            }),
          },
          options,
        );

      let completion: OpenAI.ChatCompletion;
      try {
        try {
          completion = await request(true);
        } catch (err) {
          // Not every provider or model supports JSON-schema output. Ask again with the schema
          // in the prompt instead; the answer is validated the same way either way.
          if (!(err instanceof OpenAI.BadRequestError || err instanceof OpenAI.UnprocessableEntityError)) throw err;
          completion = await request(false);
        }
      } catch (err) {
        throw fail(err, model);
      }

      const choice = completion.choices[0];
      if (!choice) throw new ScanError(`${provider.name} returned an empty answer. Try again.`);
      if (choice.message.refusal || choice.finish_reason === "content_filter") {
        throw new ScanError(`${provider.name} declined to analyse this document.`);
      }
      if (choice.finish_reason === "length") {
        throw new ScanError("The analysis ran out of room before it finished. Try a model with a larger output limit.");
      }
      return {
        result: parseAnswerText(choice.message.content ?? "", provider.name),
        model: completion.model || model,
        usage: completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : null,
      };
    },

    async listModels(signal) {
      try {
        const models = [];
        for await (const m of client.models.list(signal ? { signal } : {})) models.push({ id: m.id, label: m.id });
        return models.sort((a, b) => a.id.localeCompare(b.id));
      } catch (err) {
        throw fail(err);
      }
    },
  };
};

function toFailure(err: unknown): ApiFailure {
  if (err instanceof OpenAI.APIUserAbortError) return { aborted: true, message: err.message };
  if (err instanceof OpenAI.APIConnectionError) return { unreachable: true, message: err.message };
  if (err instanceof OpenAI.APIError) {
    const status: unknown = err.status; // the SDK types this loosely
    return { status: typeof status === "number" ? status : undefined, message: err.message };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}
