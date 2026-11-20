import { expect, test } from "@playwright/test";
import { looksLikePolicyPage } from "../../src/lib/policy";

const POLICY_PATHS = [
  "/privacy", "/privacy-policy", "/legal/privacy", "/tos", "/terms-of-service", "/en/terms.html",
  "/policies/cookie-policy", "/eula", "/user-agreement", "/PrivacyPolicy", "/legal",
];
const OTHER_PATHS = ["/", "/photos/123", "/mentos", "/paralegal-jobs", "/stories", "/determinism", "/legalese-blog"];

for (const path of POLICY_PATHS) {
  test(`policy path: ${path}`, () => {
    expect(looksLikePolicyPage(path, "")).toBe(true);
  });
}
for (const path of OTHER_PATHS) {
  test(`not a policy path: ${path}`, () => {
    expect(looksLikePolicyPage(path, "Home")).toBe(false);
  });
}

test("matches by title", () => {
  expect(looksLikePolicyPage("/p/123", "Acme — Privacy Notice")).toBe(true);
  expect(looksLikePolicyPage("/p/123", "Terms & Conditions | Acme")).toBe(true);
  expect(looksLikePolicyPage("/p/123", "Our new privacy features")).toBe(false);
});
