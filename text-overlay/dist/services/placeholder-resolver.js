// Minimal set copied from AdCreator2 placeholder behavior
const IMAGE_PLACEHOLDER_REGEX = /(?:PLACE_(?:LOGO|PRODUCT_IMAGE|SCREENSHOT|BACKGROUND)(?:_\d+)?(?:_HERE)?|PLACE_IMAGE_HERE|PLACE_IMAGE_\d+_HERE|IMAGE_\d+_HERE)/gi;
const NUMBERED_REGEX = /(?:PLACE_(?:SCREENSHOT|PRODUCT_IMAGE)|PLACE_IMAGE|IMAGE)_(\d+)(?:_HERE)?/i;
const COLOR_KEYS = [
    'COLOR_BRANDCOLOR',
    'COLOR_PRIMARY',
    'COLOR_SECONDARY',
    'COLOR_CONTRAST',
    'COLOR_LIGHT_CONTRAST_TO_BRANDCOLOR_HERE',
    'COLOR_LIGHT_CONTRAST',
    'COLOR_DARK_CONTRAST',
    'COLOR_DARK_CONTRAST_TO_BRANDCOLOR',
    'COLOR_ACCENT_1',
    'COLOR_ACCENT_2'
];
export class PlaceholderResolver {
    constructor(mapping) {
        this.mapping = mapping;
    }
    resolveImage(placeholder) {
        const p = placeholder.toUpperCase();
        if (/PLACE_LOGO/.test(p))
            return this.mapping.images.logo || null;
        if (/PLACE_BACKGROUND/.test(p)) {
            const list = (this.mapping.images.backgrounds || []).filter(Boolean);
            if (list.length === 0)
                return null;
            const m = p.match(NUMBERED_REGEX);
            const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
            return list[idx % list.length];
        }
        if (/PLACE_PRODUCT_IMAGE/.test(p) || /PLACE_IMAGE_\d+_HERE/.test(p) || /IMAGE_\d+_HERE/.test(p)) {
            const m = p.match(NUMBERED_REGEX);
            const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
            const list = (this.mapping.images.products || []).filter(Boolean);
            if (list.length === 0)
                return null;
            return list[idx % list.length];
        }
        if (/PLACE_SCREENSHOT/.test(p)) {
            const m = p.match(NUMBERED_REGEX);
            const idx = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
            const list = (this.mapping.images.screenshots || []).filter(Boolean);
            if (list.length === 0)
                return null;
            return list[idx % list.length];
        }
        if (/PLACE_IMAGE_HERE/.test(p)) {
            // Generic image placeholder: prefer product, then screenshot, then background, then logo
            return this.mapping.images.products[0]
                || this.mapping.images.screenshots[0]
                || this.mapping.images.backgrounds[0]
                || this.mapping.images.logo
                || null;
        }
        return null;
    }
    resolveColor(placeholder) {
        const p = placeholder.toUpperCase();
        if (!COLOR_KEYS.includes(p) && !p.startsWith('COLOR_'))
            return null;
        if (p === 'COLOR_BRANDCOLOR' || p === 'COLOR_PRIMARY')
            return this.mapping.colors.brand_primary;
        if (p === 'COLOR_SECONDARY')
            return this.mapping.colors.brand_secondary;
        if (p === 'COLOR_ACCENT_1')
            return this.mapping.colors.accent_1 || this.mapping.colors.brand_secondary;
        if (p === 'COLOR_ACCENT_2')
            return this.mapping.colors.accent_2 || this.mapping.colors.brand_secondary;
        // Contrast heuristics
        if (p === 'COLOR_CONTRAST' || p === 'COLOR_LIGHT_CONTRAST' || p === 'COLOR_LIGHT_CONTRAST_TO_BRANDCOLOR_HERE') {
            return this.contrastFor(this.mapping.colors.brand_primary, true);
        }
        if (p === 'COLOR_DARK_CONTRAST' || p === 'COLOR_DARK_CONTRAST_TO_BRANDCOLOR') {
            return this.contrastFor(this.mapping.colors.brand_primary, false);
        }
        return null;
    }
    contrastFor(hex, light) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16) / 255;
        const g = parseInt(c.substring(2, 4), 16) / 255;
        const b = parseInt(c.substring(4, 6), 16) / 255;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (light) {
            // return a light contrast color
            if (L < 0.3)
                return lighten(hex, 80);
            if (L < 0.6)
                return lighten(hex, 90);
            return '#FFFFFF';
        }
        else {
            // return a dark contrast color
            if (L > 0.7)
                return darken(hex, 80);
            if (L > 0.4)
                return darken(hex, 70);
            return '#000000';
        }
    }
}
function lighten(hex, pct) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const L = (v) => Math.round(Math.min(255, v + (255 - v) * (pct / 100))).toString(16).padStart(2, '0');
    return `#${L(r)}${L(g)}${L(b)}`;
}
function darken(hex, pct) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const D = (v) => Math.round(Math.max(0, v * (1 - pct / 100))).toString(16).padStart(2, '0');
    return `#${D(r)}${D(g)}${D(b)}`;
}
export function replacePlaceholdersInSVG(svg, resolver) {
    // Replace colors
    for (const key of ['COLOR_BRANDCOLOR', 'COLOR_PRIMARY', 'COLOR_SECONDARY', 'COLOR_CONTRAST', 'COLOR_LIGHT_CONTRAST_TO_BRANDCOLOR_HERE', 'COLOR_LIGHT_CONTRAST', 'COLOR_DARK_CONTRAST', 'COLOR_DARK_CONTRAST_TO_BRANDCOLOR', 'COLOR_ACCENT_1', 'COLOR_ACCENT_2']) {
        const color = resolver.resolveColor(key);
        if (color) {
            const rx = new RegExp(`(#)?${key}`, 'g');
            svg = svg.replace(rx, color);
            try {
                console.log(`[compose] color ${key} -> ${color}`);
            }
            catch { }
        }
    }
    // Sequentially replace image placeholders with ordered cycling
    const products = Array.isArray(resolver.mapping?.images?.products) ? resolver.mapping.images.products.filter(Boolean) : [];
    const screenshots = Array.isArray(resolver.mapping?.images?.screenshots) ? resolver.mapping.images.screenshots.filter(Boolean) : [];
    const backgrounds = Array.isArray(resolver.mapping?.images?.backgrounds) ? resolver.mapping.images.backgrounds.filter(Boolean) : [];
    let prodIdx = 0, shotIdx = 0, bgIdx = 0;
    svg = svg.replace(IMAGE_PLACEHOLDER_REGEX, (token) => {
        const up = token.toUpperCase();
        const m = up.match(NUMBERED_REGEX);
        if (/PLACE_PRODUCT_IMAGE/.test(up) || /PLACE_IMAGE_\d+_HERE/.test(up) || /IMAGE_\d+_HERE/.test(up)) {
            if (products.length === 0)
                return token;
            const i = m ? Math.max(0, parseInt(m[1], 10) - 1) % products.length : (prodIdx++ % products.length);
            return products[i];
        }
        if (/PLACE_SCREENSHOT/.test(up)) {
            if (screenshots.length === 0)
                return token;
            const i = m ? Math.max(0, parseInt(m[1], 10) - 1) % screenshots.length : (shotIdx++ % screenshots.length);
            return screenshots[i];
        }
        if (/PLACE_BACKGROUND/.test(up)) {
            if (backgrounds.length === 0)
                return token;
            const i = m ? Math.max(0, parseInt(m[1], 10) - 1) % backgrounds.length : (bgIdx++ % backgrounds.length);
            return backgrounds[i];
        }
        // Generic placeholder fallback: prefer products then screenshots then backgrounds then logo
        const generic = products[0] || screenshots[0] || backgrounds[0] || resolver.mapping?.images?.logo || token;
        return generic;
    });
    return svg;
}
