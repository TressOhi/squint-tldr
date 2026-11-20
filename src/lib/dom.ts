// Tiny DOM helpers for the extension pages. Children are appended as text nodes, never HTML,
// so content from documents can't inject markup.

type Child = Node | string | null | undefined | false | readonly Child[];
type Props = Record<string, string | ((e: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") node.addEventListener(key.replace(/^on/, ""), value);
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  const append = (c: Child): void => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) (c as readonly Child[]).forEach(append);
    else node.append(c as Node | string);
  };
  children.forEach(append);
  return node;
}

/** Looks up an element the page's HTML must contain, checking its type at runtime. */
export function mustGet<T extends HTMLElement>(id: string, type: new () => T): T;
export function mustGet(id: string): HTMLElement;
export function mustGet(id: string, type: new () => HTMLElement = HTMLElement): HTMLElement {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Expected #${id} to be a ${type.name}`);
  return node;
}
