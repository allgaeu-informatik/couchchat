// Table driven translation of static English text in upstream HTML views.
// Each entry is [english, german, expectedCount = 1]. The English side is matched as the COMPLETE text node
// (">  text  <", whitespace tolerant) or as the COMPLETE value of a user-visible attribute
// (placeholder, title, aria-label, alt, label). A count mismatch aborts the patch run (upstream changed).

const ATTRS = 'placeholder|title|aria-label|alt|label';

function esc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {object} ctx patch context (uses ctx.replaceN for strict counting)
 * @param {string} html file content
 * @param {Array<[string, string, number?]>} table
 * @param {string} label short name for log/error messages
 */
export function translateStatic(ctx, html, table, label) {
    for (const [en, de, expect = 1] of table) {
        const e = esc(en).replace(/ /g, '\\s+');
        const re = new RegExp(`(>\\s*)${e}(\\s*<)|(\\b(?:${ATTRS})=")${e}(")`);
        html = ctx.replaceN(
            html,
            re,
            (m, a, b, c, d) => (a !== undefined ? `${a}${de}${b}` : `${c}${de}${d}`),
            `${label}: "${en}"`,
            expect
        );
    }
    return html;
}
