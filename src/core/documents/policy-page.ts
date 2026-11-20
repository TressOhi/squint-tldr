// Guesses whether a page is a policy or terms page, to hint (with a badge) that a scan is available.

// Whole path words only: "/tos" and "/privacy-policy" match, "/photos" and "/paralegal-jobs" don't.
const PATH_WORD =
  /(?:^|[/_.-])(?:privacy|privacypolicy|terms|termsofuse|termsofservice|tos|legal|eula|conditions|cookie-policy|cookies-policy|user-agreement)(?=[/_.-]|$)/;
const TITLE =
  /privacy (?:policy|notice|statement)|terms (?:of|and) (?:service|use)|terms (?:&|and) conditions|cookie (?:policy|notice)|user agreement|\beula\b/;

export function looksLikePolicyPage(pathname: string, title: string): boolean {
  return PATH_WORD.test(pathname.toLowerCase()) || TITLE.test(title.toLowerCase());
}
