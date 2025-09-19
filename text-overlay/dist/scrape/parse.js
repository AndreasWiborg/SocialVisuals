import * as cheerio from 'cheerio';
function pickHeroText($) {
    let best;
    $('h1, h2').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ');
        if (!best || (t.length > best.length && t.length < 140))
            best = t;
    });
    if (best)
        return best;
    let alt;
    $('[class*="hero"], [class*="headline"], [class*="title"]').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ');
        if (!alt || (t.length > alt.length && t.length < 140))
            alt = t;
    });
    return alt;
}
export function parseHTML(html, url) {
    const $ = cheerio.load(html);
    const lang = ($('html').attr('lang') || $("meta[http-equiv='content-language']").attr('content') || '').trim();
    const title = ($('title').first().text() || '').trim();
    const description = ($("meta[name='description']").attr('content') || '').trim();
    const ogTitle = ($("meta[property='og:title']").attr('content') || '').trim();
    const ogDesc = ($("meta[property='og:description']").attr('content') || '').trim();
    const ogSiteName = ($("meta[property='og:site_name']").attr('content') || '').trim();
    const headings = [];
    $('h1, h2, h3').slice(0, 10).each((_, el) => headings.push($(el).text().trim().replace(/\s+/g, ' ')));
    const buttons = [];
    $('a, button').each((_, el) => {
        const t = $(el).text().trim().replace(/\s+/g, ' ');
        if (t && t.length <= 40)
            buttons.push(t);
    });
    const heroText = pickHeroText($);
    const hasPricing = /pricing|plans|trial|start free/i.test(html);
    const hasCart = /add to cart|cart|checkout|basket/i.test(html);
    const hasAppBadges = /app store|google play|download app/i.test(html);
    const hasBlog = /\/blog\/|read more|learn more/i.test(html) && !hasPricing && !hasCart;
    return { url, lang, title, description, ogTitle, ogDesc, ogSiteName, heroText, headings, buttons, hasPricing, hasCart, hasAppBadges, hasBlog };
}
