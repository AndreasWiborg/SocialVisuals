/**
 * Color Extraction Service
 *
 * Extracts brand colors from uploaded images with intelligent selection
 */
import sharp from 'sharp';
export class ColorExtractionService {
    /**
     * Extract brand colors from categorized images
     */
    async extractBrandColors(images) {
        // Priority order: logo → products → screenshots
        const sourceImage = await this.selectBestSource(images);
        if (!sourceImage) {
            return this.getDefaultColors();
        }
        try {
            const palette = await this.extractPalette(sourceImage);
            console.log('🎨 Extracted palette:', {
                primary: palette.primary,
                secondary: palette.secondary,
                accent1: palette.suggestions.accent1,
                accent2: palette.suggestions.accent2
            });
            // Ensure we always have 4 colors
            const result = {
                brand_primary: palette.primary,
                brand_secondary: palette.secondary || this.generateSecondary(palette.primary),
                accent_1: palette.suggestions.accent1 || this.generateAccent1(palette.primary),
                accent_2: palette.suggestions.accent2 || this.generateAccent2(palette.primary)
            };
            console.log('🎨 Final color mapping:', result);
            return result;
        }
        catch (error) {
            console.error('Error extracting colors:', error);
            return this.getDefaultColors();
        }
    }
    /**
     * Select the best image source for color extraction
     */
    async selectBestSource(images) {
        // 1. Logo is best source
        if (images.logo) {
            return images.logo;
        }
        // 2. First product image
        if (images.products.length > 0) {
            return images.products[0];
        }
        // 3. First screenshot (less ideal)
        if (images.screenshots.length > 0) {
            return images.screenshots[0];
        }
        // 4. Background (least ideal)
        if (images.backgrounds.length > 0) {
            return images.backgrounds[0];
        }
        return null;
    }
    /**
     * Extract color palette from image
     */
    async extractPalette(imagePath) {
        const image = sharp(imagePath);
        // Resize for faster processing
        const processed = await image
            .resize(200, 200, { fit: 'inside' })
            .toFormat('png')
            .toBuffer();
        // Get dominant colors using sharp's stats
        const { dominant, channels } = await sharp(processed).stats();
        console.log('🎨 Analyzing image for colors:', imagePath);
        // Extract more colors by quantizing the image
        const quantized = await sharp(processed)
            .resize(50, 50, { fit: 'inside' })
            .raw()
            .toBuffer();
        const colorMap = new Map();
        // Count color frequencies
        for (let i = 0; i < quantized.length; i += channels.length) {
            const r = Math.round(quantized[i] / 16) * 16;
            const g = Math.round(quantized[i + 1] / 16) * 16;
            const b = Math.round(quantized[i + 2] / 16) * 16;
            const hex = this.rgbToHex({ r, g, b });
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
        // Convert to ExtractedColor array
        const colors = Array.from(colorMap.entries())
            .map(([hex, count]) => {
            const rgb = this.hexToRgb(hex);
            const hsl = this.rgbToHsl(rgb);
            return {
                hex,
                rgb,
                hsl,
                frequency: count,
                isVibrant: this.isVibrantColor(hsl),
                isBrandable: this.isBrandableColor(hsl)
            };
        })
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10); // Top 10 colors
        // Select brand colors
        const primary = this.selectPrimaryColor(colors);
        const secondary = this.selectSecondaryColor(colors, primary);
        const suggestions = this.suggestAccentColors(colors, primary, secondary);
        return {
            colors,
            primary: primary.hex,
            secondary: secondary?.hex,
            suggestions
        };
    }
    /**
     * Select primary brand color
     */
    selectPrimaryColor(colors) {
        // Find the most prominent brandable color
        const brandable = colors.filter(c => c.isBrandable);
        if (brandable.length > 0) {
            // Prefer vibrant colors
            const vibrant = brandable.filter(c => c.isVibrant);
            if (vibrant.length > 0) {
                return vibrant[0];
            }
            return brandable[0];
        }
        // Fallback to most frequent non-gray color
        const nonGray = colors.filter(c => c.hsl.s > 0.1);
        if (nonGray.length > 0) {
            return nonGray[0];
        }
        // Last resort
        return colors[0] || this.createDefaultColor();
    }
    /**
     * Select secondary brand color
     */
    selectSecondaryColor(colors, primary) {
        // Find colors that complement the primary
        const candidates = colors.filter(c => c.hex !== primary.hex &&
            c.isBrandable &&
            Math.abs(c.hsl.h - primary.hsl.h) > 30 // Different hue
        );
        if (candidates.length > 0) {
            return candidates[0];
        }
        // Try any brandable color different from primary
        const anyBrandable = colors.filter(c => c.hex !== primary.hex && c.isBrandable);
        return anyBrandable[0];
    }
    /**
     * Suggest accent colors
     */
    suggestAccentColors(colors, primary, secondary) {
        const used = new Set([primary.hex, secondary?.hex].filter(Boolean));
        const available = colors.filter(c => !used.has(c.hex) && c.isBrandable);
        const suggestions = {};
        // Accent 1: Complementary color
        const complementary = this.calculateComplementary(primary);
        const closeToComplementary = available.find(c => Math.abs(c.hsl.h - complementary.h) < 30);
        if (closeToComplementary) {
            suggestions.accent1 = closeToComplementary.hex;
        }
        else if (available.length > 0) {
            suggestions.accent1 = available[0].hex;
        }
        // Accent 2: Triadic color
        if (available.length > 1) {
            const triadic = (primary.hsl.h + 120) % 360;
            const closeToTriadic = available.find(c => Math.abs(c.hsl.h - triadic) < 30 && c.hex !== suggestions.accent1);
            suggestions.accent2 = closeToTriadic?.hex || available[1].hex;
        }
        return suggestions;
    }
    /**
     * Check if color is vibrant
     */
    isVibrantColor(hsl) {
        return hsl.s > 0.5 && hsl.l > 0.3 && hsl.l < 0.7;
    }
    /**
     * Check if color is suitable for branding
     */
    isBrandableColor(hsl) {
        // Not too light or dark
        if (hsl.l < 0.2 || hsl.l > 0.8)
            return false;
        // Not gray
        if (hsl.s < 0.2)
            return false;
        return true;
    }
    /**
     * Generate a secondary color from primary
     */
    generateSecondary(primaryHex) {
        const primary = this.hexToRgb(primaryHex);
        const hsl = this.rgbToHsl(primary);
        // Shift hue by 30-60 degrees
        const newHue = (hsl.h + 45) % 360;
        // Adjust lightness for contrast
        const newLightness = hsl.l > 0.5 ? hsl.l - 0.2 : hsl.l + 0.2;
        const rgb = this.hslToRgb({ h: newHue, s: hsl.s, l: newLightness });
        return this.rgbToHex(rgb);
    }
    /**
     * Calculate complementary color
     */
    calculateComplementary(color) {
        return {
            h: (color.hsl.h + 180) % 360,
            s: color.hsl.s,
            l: color.hsl.l
        };
    }
    /**
     * Generate accent 1 (complementary color)
     */
    generateAccent1(primaryHex) {
        const primary = this.hexToRgb(primaryHex);
        const hsl = this.rgbToHsl(primary);
        console.log(`🎨 Generating Accent 1 from primary ${primaryHex}:`, {
            primaryHSL: hsl,
            primaryRGB: primary
        });
        // Complementary color (180° opposite)
        const newHue = (hsl.h + 180) % 360;
        // Keep saturation high for accent
        const newSaturation = Math.max(hsl.s, 0.6);
        // Adjust lightness for good contrast
        const newLightness = hsl.l > 0.5 ? 0.4 : 0.6;
        const newHSL = { h: newHue, s: newSaturation, l: newLightness };
        console.log(`🎨 Accent 1 HSL:`, newHSL);
        const rgb = this.hslToRgb(newHSL);
        const hex = this.rgbToHex(rgb);
        console.log(`🎨 Accent 1 final: ${hex}`);
        return hex;
    }
    /**
     * Generate accent 2 (triadic color)
     */
    generateAccent2(primaryHex) {
        const primary = this.hexToRgb(primaryHex);
        const hsl = this.rgbToHsl(primary);
        // Triadic color (120° rotation)
        const newHue = (hsl.h + 120) % 360;
        // Slightly reduce saturation for variety
        const newSaturation = hsl.s * 0.8;
        // Different lightness from accent 1
        const newLightness = hsl.l > 0.5 ? 0.3 : 0.7;
        const rgb = this.hslToRgb({ h: newHue, s: newSaturation, l: newLightness });
        return this.rgbToHex(rgb);
    }
    /**
     * Default colors fallback
     */
    getDefaultColors() {
        return {
            brand_primary: '#000000',
            brand_secondary: '#666666',
            accent_1: '#0066CC',
            accent_2: '#00AA44'
        };
    }
    /**
     * Create default color object
     */
    createDefaultColor() {
        return {
            hex: '#000000',
            rgb: { r: 0, g: 0, b: 0 },
            hsl: { h: 0, s: 0, l: 0 },
            frequency: 0,
            isVibrant: false,
            isBrandable: false
        };
    }
    /**
     * Color conversion utilities
     */
    rgbToHex(rgb) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
        return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }
    hexToRgb(hex) {
        const clean = hex.replace('#', '');
        return {
            r: parseInt(clean.substr(0, 2), 16),
            g: parseInt(clean.substr(2, 2), 16),
            b: parseInt(clean.substr(4, 2), 16)
        };
    }
    rgbToHsl(rgb) {
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) {
            return { h: 0, s: 0, l };
        }
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
            default:
                h = 0;
        }
        return {
            h: Math.round(h * 360),
            s: s, // Keep as 0-1 for consistency
            l: l // Keep as 0-1 for consistency
        };
    }
    hslToRgb(hsl) {
        const h = hsl.h / 360;
        const s = hsl.s;
        const l = hsl.l;
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        }
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0)
                    t += 1;
                if (t > 1)
                    t -= 1;
                if (t < 1 / 6)
                    return p + (q - p) * 6 * t;
                if (t < 1 / 2)
                    return q;
                if (t < 2 / 3)
                    return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
}
