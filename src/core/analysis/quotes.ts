// Every flag must quote the document. We check each quote really appears in the text we
// sent, so the model can't invent a clause. Pure functions, covered by unit tests.

/** Lowercases, folds accents and typographic quotes, and reduces everything that isn't a
 *  letter or digit (in any script) to single spaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // combining marks left over from NFKD (é → e)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const ELLIPSIS = /\.{3}|…|\[\.\.\.\]/;
/** Fragments shorter than this prove nothing on their own ("and the"). */
const MIN_FRAGMENT = 12;

/** True if `quote` appears in the already-normalized document text. A quote containing an
 *  ellipsis passes only if each substantial fragment appears, in order. */
export function quoteAppears(quote: string, normalizedText: string): boolean {
  const parts = quote.split(ELLIPSIS).map(normalize).filter(Boolean);
  if (parts.length === 0) return false;
  const substantial = parts.length === 1 ? parts : parts.filter((p) => p.length >= MIN_FRAGMENT);
  if (substantial.length === 0) return false;

  let from = 0;
  for (const part of substantial) {
    const at = normalizedText.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}

/** Splits items into those whose quotes appear in the document and those that don't. */
export function verifyQuotes<T extends { quote: string }>(
  items: readonly T[],
  documentText: string,
): { verified: T[]; rejected: T[] } {
  const haystack = normalize(documentText);
  const verified: T[] = [];
  const rejected: T[] = [];
  for (const item of items) (quoteAppears(item.quote, haystack) ? verified : rejected).push(item);
  return { verified, rejected };
}
