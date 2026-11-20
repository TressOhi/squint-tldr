// Turns a model's text answer into a validated AnalysisResult.
import { ScanError } from "../errors";
import { AnalysisResult } from "./schema";

/**
 * Parses the model's answer. Providers without enforced structured output sometimes wrap the
 * JSON in a code fence or put reasoning (`<think>…</think>`) before it, so this looks for the
 * outermost JSON object rather than requiring the whole text to be JSON.
 */
export function parseAnswerText(text: string, who: string): AnalysisResult {
  const raw = extractJson(text.replace(/<think>[\s\S]*?<\/think>/gi, ""));
  if (raw === undefined) throw new ScanError(`${who}'s answer couldn't be read. Try again.`);
  const parsed = AnalysisResult.safeParse(raw);
  if (!parsed.success) throw new ScanError(`${who}'s answer wasn't in the expected format. Try again, or try another model.`);
  return parsed.data;
}

function extractJson(text: string): unknown {
  const attempts = [text.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}
