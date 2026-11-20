import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { expect, test } from "@playwright/test";
import { parseAnswerText } from "../../src/core/analysis/answer";
import { ANALYSIS_JSON_SCHEMA, AnalysisResult } from "../../src/core/analysis/schema";
import { ScanError } from "../../src/core/errors";
import { parseFinalAnswer } from "../../src/core/llm/adapters/anthropic-messages";

const answer = {
  document_type: "privacy_policy",
  service_name: "Acme",
  verdict: "some_concerns",
  verdict_reason: "Shares data with advertisers.",
  tldr: ["They share your data with advertisers."],
  flags: [{ severity: "red", category: "data_selling", title: "Shares data", quote: "We share data.", explanation: "Ads." }],
  opt_outs: [],
};

const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;
const fallback = { type: "fallback", from: { model: "a" }, to: { model: "b" } } as unknown as Anthropic.Beta.BetaContentBlock;

test("parses a plain answer", () => {
  expect(parseFinalAnswer([text(JSON.stringify(answer))], "Test")).toEqual(answer);
});

test("uses only the text after the last fallback switch", () => {
  const content = [text('{"document_type": "priv'), fallback, text(JSON.stringify(answer))];
  expect(parseFinalAnswer(content, "Test").service_name).toBe("Acme");
});

test("rejects malformed or off-schema answers with a ScanError", () => {
  expect(() => parseFinalAnswer([text("not json")], "Test")).toThrow(ScanError);
  expect(() => parseFinalAnswer([text(JSON.stringify({ ...answer, verdict: "fine" }))], "Test")).toThrow(ScanError);
});

/** Collects every object node in a JSON schema. */
function objectsIn(schema: unknown): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "object") objects.push(obj);
    Object.values(obj).forEach(walk);
  };
  walk(schema);
  return objects;
}

// Strict structured output (on both protocols) only accepts closed objects with every field required.
for (const [name, schema] of [
  ["anthropic-messages", betaZodOutputFormat(AnalysisResult).schema],
  ["openai-chat", ANALYSIS_JSON_SCHEMA],
] as const) {
  test(`the ${name} schema is closed and fully required at every level`, () => {
    const objects = objectsIn(schema);
    expect(objects.length).toBe(3); // result, flag, opt-out
    for (const obj of objects) {
      expect(obj.additionalProperties).toBe(false);
      expect([...(obj.required as string[])].sort()).toEqual(Object.keys(obj.properties as object).sort());
    }
  });
}

test("the openai-chat schema has no dialect marker", () => {
  expect(ANALYSIS_JSON_SCHEMA).not.toHaveProperty("$schema");
});

// Providers without enforced structured output wrap or preface their JSON.
test("reads JSON inside a code fence", () => {
  expect(parseAnswerText("Here you go:\n```json\n" + JSON.stringify(answer) + "\n```", "Test")).toEqual(answer);
});

test("skips reasoning before the JSON", () => {
  expect(parseAnswerText(`<think>Let me look at {this}…</think>\n${JSON.stringify(answer)}`, "Test")).toEqual(answer);
});

test("reads JSON with prose around it", () => {
  expect(parseAnswerText(`Sure. ${JSON.stringify(answer)} Hope that helps.`, "Test")).toEqual(answer);
});

test("names the provider in parse errors", () => {
  expect(() => parseAnswerText("no idea", "Groq")).toThrow("Groq's answer couldn't be read");
});
