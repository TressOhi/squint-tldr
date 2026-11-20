// Turns fetched HTML into readable text (used for "paste a link").

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6",
  "TR", "TABLE", "BR", "HR", "BLOCKQUOTE", "PRE", "DD", "DT", "DL", "MAIN", "HEADER", "FOOTER",
]);
// Only things that are never policy text. Forms, buttons and hidden elements stay: some sites
// wrap the whole page in a <form>, and policies often sit in collapsed accordions.
const DROP = "script, style, noscript, svg, template, iframe, nav, select, textarea";

export interface ExtractedDocument {
  title: string;
  text: string;
}

export function htmlToText(html: string): ExtractedDocument {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(DROP).forEach((el) => {
    el.remove();
  });
  const title = doc.querySelector("title")?.textContent.trim() ?? "";
  const body = doc.body; // DOMParser always creates a body for text/html

  // Prefer the main content area when it holds most of the text.
  const main = doc.querySelector("main, article, [role='main']");
  const root = main && main.textContent.length > body.textContent.length * 0.4 ? main : body;

  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) return;
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock) parts.push("\n");
    node.childNodes.forEach(walk);
    if (isBlock) parts.push("\n");
  };
  walk(root);

  const text = parts
    .join("")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export class FetchError extends Error {
  override name = "FetchError";
}

/** Fetches a document; `signal` cancels it (rejecting with the abort reason). The extension's host permission lets this skip CORS; no cookies are sent. */
export async function fetchDocument(url: string, signal?: AbortSignal): Promise<ExtractedDocument & { finalUrl: string }> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "omit", redirect: "follow", ...(signal && { signal }) });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new FetchError("Couldn't open that link. Check the address and your connection.");
  }
  if (!res.ok) throw new FetchError(`That link returned an error (${res.status}).`);

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) {
    throw new FetchError("PDF policies aren't supported yet. Open the PDF, copy the text and use “Paste text”.");
  }
  const body = await res.text();
  const finalUrl = res.url || url;
  if (type.includes("text/plain")) return { title: "", text: body, finalUrl };
  return { ...htmlToText(body), finalUrl };
}
