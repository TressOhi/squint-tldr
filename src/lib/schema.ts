// The shape Claude must return for every scan. The same Zod schema is sent to the API
// (structured outputs) and used to validate the response before we trust it.
import * as z from "zod/v4";

export const CATEGORIES = {
  data_selling: "Selling or sharing your data",
  tracking: "Tracking and profiling",
  data_retention: "Keeping your data",
  data_access: "Who can see your data",
  content_license: "Rights over your content",
  arbitration: "Giving up the right to sue",
  unilateral_changes: "Changing the terms on you",
  auto_renewal: "Auto-renewal and cancellation",
  account_termination: "Closing your account",
  liability: "Limiting their responsibility",
  ai_training: "Training AI on your data",
  location_biometrics: "Location and biometric data",
  children: "Children's data",
  other: "Other",
} as const;

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

/** What the extension stores and shows: Claude's answer plus our own checks and metadata. */
export interface Scan extends AnalysisResult {
  /** Flags whose quote was not found in the document (discarded). */
  droppedFlags: number;
  truncated: boolean;
  url: string;
  title: string;
  model: string;
  costUsd: number;
  scannedAt: number;
}
