export type ScanErrorKind = "no_key" | "bad_key" | "aborted" | "input" | "api";

/** An error with a message fit to show the user as is. */
export class ScanError extends Error {
  readonly kind: ScanErrorKind;
  constructor(message: string, kind: ScanErrorKind = "api") {
    super(message);
    this.name = "ScanError";
    this.kind = kind;
  }
}

/** A failed API call, described the same way whichever SDK made it. */
export interface ApiFailure {
  aborted?: boolean;
  /** No HTTP response at all: offline, wrong address, or a local server that isn't running. */
  unreachable?: boolean;
  status?: number | undefined;
  message: string;
}

export interface FailureContext {
  providerName: string;
  model?: string;
  local?: boolean;
}

export function describeFailure(f: ApiFailure, { providerName, model, local }: FailureContext): ScanError {
  if (f.aborted) return new ScanError("Scan cancelled.", "aborted");
  if (f.unreachable) {
    return new ScanError(
      local ? `Couldn't reach ${providerName}. Is it running?` : `Couldn't reach ${providerName}. Check your connection.`,
    );
  }
  switch (f.status) {
    case 401:
      return new ScanError(`${providerName} rejected this API key. Check it in Settings.`, "bad_key");
    case 403:
      return new ScanError(
        local
          ? `${providerName} refused the request. It may need to allow browser extensions; see Squint's README.`
          : `This key doesn't have access${model ? ` to ${model}` : ""}.`,
        "bad_key",
      );
    case 404:
      return new ScanError(
        model ? `${providerName} has no model called ${model}. Pick another in Settings.` : `${providerName} couldn't find that address.`,
      );
    case 429:
      return new ScanError(`You've hit your ${providerName} rate limit or quota. Wait a minute and try again.`);
    case 400:
    case 413:
    case 422:
      return new ScanError(`${providerName} couldn't process this: ${f.message}`);
    default:
      return new ScanError(`${providerName} error${f.status ? ` ${f.status}` : ""}: ${f.message}`);
  }
}
