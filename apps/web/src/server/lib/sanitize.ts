// Strips dangerous HTML before content is persisted — prevents stored XSS.
// isomorphic-dompurify works in both Node.js and browser environments.
import DOMPurify from "isomorphic-dompurify";

export function sanitize(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    FORCE_BODY: true,
  });
}

// For plain-text fields — strips ALL HTML tags entirely
export function sanitizePlainText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
