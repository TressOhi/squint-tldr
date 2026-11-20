import { expect, test } from "@playwright/test";
import { normalize, quoteAppears, verifyQuotes } from "../../src/lib/quotes";

const POLICY = `
  12. Dispute Resolution. YOU AND ACME AGREE THAT ANY DISPUTE WILL BE RESOLVED BY BINDING,
  INDIVIDUAL ARBITRATION — and you waive the right to participate in a class action.
  We may share your “Personal Information” with advertising partners.
  Nous pouvons modifier ces conditions à tout moment.
  我们可能会与广告合作伙伴共享您的个人信息。
`;
const haystack = normalize(POLICY);

test("ignores case, punctuation, curly quotes and line breaks", () => {
  expect(quoteAppears("You and Acme agree that any dispute will be resolved by binding, individual arbitration", haystack)).toBe(true);
  expect(quoteAppears('We may share your "Personal Information" with advertising partners.', haystack)).toBe(true);
});

test("folds accents and keeps non-Latin scripts", () => {
  expect(quoteAppears("Nous pouvons modifier ces conditions a tout moment", haystack)).toBe(true);
  expect(quoteAppears("我们可能会与广告合作伙伴共享您的个人信息", haystack)).toBe(true);
});

test("rejects invented or altered wording", () => {
  expect(quoteAppears("We sell your personal information to data brokers.", haystack)).toBe(false);
  expect(quoteAppears("We may share your Personal Information with law enforcement.", haystack)).toBe(false);
  expect(quoteAppears("我们出售您的个人信息", haystack)).toBe(false);
});

test("an ellipsis quote passes only if each substantial part appears in order", () => {
  expect(quoteAppears("binding, individual arbitration ... waive the right to participate in a class action", haystack)).toBe(true);
  expect(quoteAppears("waive the right to participate in a class action ... binding, individual arbitration", haystack)).toBe(false);
  expect(quoteAppears("you … and", haystack)).toBe(false);
});

test("empty quotes never pass", () => {
  expect(quoteAppears("", haystack)).toBe(false);
  expect(quoteAppears(" ... ", haystack)).toBe(false);
});

test("verifyQuotes splits items and keeps their order", () => {
  const items = [
    { id: 1, quote: "advertising partners" },
    { id: 2, quote: "we read your mind" },
    { id: 3, quote: "class action" },
  ];
  const { verified, rejected } = verifyQuotes(items, POLICY);
  expect(verified.map((i) => i.id)).toEqual([1, 3]);
  expect(rejected.map((i) => i.id)).toEqual([2]);
});
