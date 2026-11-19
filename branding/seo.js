'use strict';

/**
 * CouchChat - replacement for app/src/seo.js of the upstream image (copied in by scripts/patches/10-assets.mjs at image build time).
 * Keeps the exact exports and signatures of upstream:
 *   buildRobotsTxt, buildSitemapXml, buildJsonLd, normalizeBaseUrl, SITEMAP_PATHS, ROBOTS_DISALLOW
 * Neutral structured data: no author, repository, price or license fields.
 */

// Public pages worth indexing; rooms and utility pages are intentionally excluded
// (/privacy redirects to the legal pages of the operator and is therefore not listed)
const SITEMAP_PATHS = ['/'];

// Private or infinite URL spaces that crawlers must not visit
const ROBOTS_DISALLOW = [
    '/join',
    '/login',
    '/logged',
    '/profile',
    '/logout',
    '/activeRooms',
    '/customizeRoom',
    '/stats',
    '/auth/',
    '/api/',
    '/mattermost/',
];

function normalizeBaseUrl(url) {
    return String(url || '')
        .trim()
        .replace(/\/+$/, '');
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (c) => {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
        return entities[c];
    });
}

function buildRobotsTxt(baseUrl, { blockAll = false } = {}) {
    const base = normalizeBaseUrl(baseUrl);
    const lines = ['User-agent: *'];
    if (blockAll) {
        lines.push('Disallow: /');
    } else {
        ROBOTS_DISALLOW.forEach((path) => lines.push(`Disallow: ${path}`));
        if (base) lines.push('', `Sitemap: ${base}/sitemap.xml`);
    }
    return lines.join('\n') + '\n';
}

function buildSitemapXml(baseUrl, lastmod = new Date()) {
    const base = normalizeBaseUrl(baseUrl);
    const date = lastmod.toISOString().slice(0, 10);
    const urls = SITEMAP_PATHS.map(
        (path) =>
            `    <url>\n        <loc>${escapeXml(base + path)}</loc>\n        <lastmod>${date}</lastmod>\n    </url>`
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// JSON-LD for the landing page; "<" is escaped so the payload can never close the <script> tag
function buildJsonLd({ name, description, url, image }) {
    const base = normalizeBaseUrl(url);
    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${base}/#website`,
                url: `${base}/`,
                name,
                description,
                inLanguage: 'de',
            },
            {
                '@type': 'WebApplication',
                '@id': `${base}/#app`,
                name,
                description,
                url: `${base}/`,
                image,
                inLanguage: 'de',
                applicationCategory: 'CommunicationApplication',
                operatingSystem: 'Any',
                provider: {
                    '@type': 'Organization',
                    name: 'Allgäu Informatik GmbH',
                    url: 'https://allgaeu-informatik.de',
                },
            },
        ],
    };
    return JSON.stringify(graph).replace(/</g, '\u003c');
}

module.exports = { buildRobotsTxt, buildSitemapXml, buildJsonLd, normalizeBaseUrl, SITEMAP_PATHS, ROBOTS_DISALLOW };
