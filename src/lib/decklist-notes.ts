// Plain-text rendering for Decklist.raw's `notes` field (PHASE_6_PLAN.md
// item 4).
//
// Spiked against real synced rows before building (see
// agent-reports/phase-6.md): the field is keyed `notes`, not `description`
// as the plan guessed it might be, and - unlike card `text`'s fixed
// strong/em/ul/li vocabulary (src/lib/card-text.tsx) - it holds arbitrary
// user-authored HTML copy-pasted from NRDB's own rich-text editor: `<p>`,
// `<a href>`, `<img>`, `<h2>`, `<em>`, HTML entities, etc. Since the tag
// vocabulary is materially wider and untrusted (author-controlled, not
// NRDB-controlled data), this deliberately does NOT reuse
// `renderCardText()` and does NOT use `dangerouslySetInnerHTML` - it strips
// all markup down to plain text instead, preserving paragraph/line breaks
// as newlines so the content still reads sensibly.
export function plainTextFromNotes(html: string): string {
  return html
    .replace(/<\s*(p|div|h[1-6]|li)\b[^>]*>/gi, "")
    // Paragraph/div/heading-level elements get a blank line between them
    // (two newlines); list items just a single line break - collapsed back
    // down to at most one blank line by the \n{3,} pass below regardless.
    .replace(/<\s*\/\s*(p|div|h[1-6])\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
