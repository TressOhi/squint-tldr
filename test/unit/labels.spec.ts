import { expect, test } from "@playwright/test";
import { isRejectLabel } from "../../src/content/reject";

const REJECTS = [
  "Reject all", "Reject All Cookies", "Decline", "Deny", "Refuse all", "Disagree", "Only necessary",
  "Use necessary cookies only", "Accept only necessary", "Necessary cookies only", "Continue without accepting",
  "Do not consent", "Reject non-essential cookies", "Alle ablehnen", "Tout refuser", "Rechazar todo",
  "Rifiuta tutto", "  Reject\n all  ",
];
const NOT_REJECTS = [
  "Accept all", "Accept", "Agree", "Allow all", "Got it", "OK", "Okay", "Manage preferences", "Cookie settings",
  "Strictly necessary cookies", "Necessary", "Learn more", "Accept all and reject later", "No thanks",
  "Reject all — and accept marketing", "",
];

for (const label of REJECTS) {
  test(`rejects: ${JSON.stringify(label)}`, () => {
    expect(isRejectLabel(label)).toBe(true);
  });
}
for (const label of NOT_REJECTS) {
  test(`leaves alone: ${JSON.stringify(label)}`, () => {
    expect(isRejectLabel(label)).toBe(false);
  });
}
