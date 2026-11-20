import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { expect, test } from "@playwright/test";
import { parseFinalAnswer, ScanError } from "../../src/lib/analyze";
import { AnalysisResult } from "../../src/lib/schema";

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
  expect(parseFinalAnswer([text(JSON.stringify(answer))])).toEqual(answer);
});

test("uses only the text after the last fallback switch", () => {
  const content = [text('{"document_type": "priv'), fallback, text(JSON.stringify(answer))];
  expect(parseFinalAnswer(content).service_name).toBe("Acme");
});

test("rejects malformed or off-schema answers with a ScanError", () => {
  expect(() => parseFinalAnswer([text("not json")])).toThrow(ScanError);
  expect(() => parseFinalAnswer([text(JSON.stringify({ ...answer, verdict: "fine" }))])).toThrow(ScanError);
});

test("the schema sent to the API is closed and fully required at every level", () => {
  const { schema } = betaZodOutputFormat(AnalysisResult);
  const objects: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "object") objects.push(obj);
    Object.values(obj).forEach(walk);
  };
  walk(schema);
  expect(objects.length).toBe(3); // result, flag, opt-out
  for (const obj of objects) {
    expect(obj.additionalProperties).toBe(false);
    expect([...(obj.required as string[])].sort()).toEqual(Object.keys(obj.properties as object).sort());
  }
});
