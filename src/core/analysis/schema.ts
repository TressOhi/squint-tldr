// The shape the model must return for every scan. The same Zod schema is sent to the API
// (structured outputs, where the provider supports them) and used to validate the response
// before we trust it.
import * as z from "zod/v4";
import categories from "./data/categories.json" with { type: "json" };

/** Clause categories and their labels (data/categories.json). */
export const CATEGORIES = categories;

export type Category = keyof typeof CATEGORIES;
const categoryKeys = Object.keys(CATEGORIES) as [Category, ...Category[]];

export const Severity = z.enum(["red", "amber", "green"]);
export type Severity = z.infer<typeof Severity>;

export const DocumentType = z.enum([
  "privacy_policy",
  "terms_of_service",
  "cookie_policy",
  "eula",
  "other_legal",
  "not_a_policy",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const Verdict = z.enum(["low_risk", "some_concerns", "high_risk"]);
export type Verdict = z.infer<typeof Verdict>;

export const Flag = z.object({
  severity: Severity,
  category: z.enum(categoryKeys),
  title: z.string(),
  quote: z.string(),
  explanation: z.string(),
});
export type Flag = z.infer<typeof Flag>;

export const OptOut = z.object({
  action: z.string(),
  how: z.string(),
  url: z.string(),
});
export type OptOut = z.infer<typeof OptOut>;

export const AnalysisResult = z.object({
  document_type: DocumentType,
  service_name: z.string(),
  verdict: Verdict,
  verdict_reason: z.string(),
  tldr: z.array(z.string()),
  flags: z.array(Flag),
  opt_outs: z.array(OptOut),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

/** The schema as plain JSON Schema (closed objects, every field required) for OpenAI-style APIs. */
export const ANALYSIS_JSON_SCHEMA: Record<string, unknown> = (() => {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(AnalysisResult) };
  delete schema.$schema; // some providers reject the dialect marker
  return schema;
})();

/** What the extension stores and shows: the model's answer plus our own checks and metadata. */
export interface Scan extends AnalysisResult {
  /** Flags whose quote was not found in the document (discarded). */
  droppedFlags: number;
  truncated: boolean;
  url: string;
  title: string;
  model: string;
  /** Display name of the provider, e.g. "OpenAI". Missing on scans saved by older versions. */
  provider?: string;
  /** Null when the provider data has no price for the model. */
  costUsd: number | null;
  scannedAt: number;
}
