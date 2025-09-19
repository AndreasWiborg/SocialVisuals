/**
 * Visual AI Service
 *
 * Analyzes images to determine their category (logo, product, screenshot, background)
 * Uses multiple strategies: filename analysis, image metadata, and characteristics
 */
import sharp from 'sharp';
export class VisualAIService {
    /**
     * Process multiple uploaded files and categorize them
     */
    async processUserUploads(files) {
        const categorized = {
            logo: undefined,
            products: [],
            screenshots: [],
            backgrounds: [],
            analyses: new Map()
        };
        // Analyze all images in parallel
        const analyses = await Promise.all(files.map(async (file) => ({
            file,
            analysis: await this.analyzeImage(file.path, file.filename)
        })));
        // Sort by confidence to prioritize high-confidence categorizations
        analyses.sort((a, b) => b.analysis.confidence - a.analysis.confidence);
        // Categorize based on analysis
        for (const { file, analysis } of analyses) {
            categorized.analyses.set(file.path, analysis);
            if (analysis.category === 'logo' && !categorized.logo) {
                categorized.logo = file.path;
            }
            else if (analysis.category === 'product') {
                categorized.products.push(file.path);
            }
            else if (analysis.category === 'screenshot') {
                categorized.screenshots.push(file.path);
            }
            else if (analysis.category === 'background') {
                categorized.backgrounds.push(file.path);
            }
            else {
                // Fallback logic for uncertain categorizations
                if (analysis.metadata.hasTransparency && !categorized.logo && analysis.metadata.isGraphic) {
                    categorized.logo = file.path;
                }
                else if (analysis.metadata.aspectRatio && analysis.metadata.aspectRatio > 2.5) {
                    categorized.backgrounds.push(file.path);
                }
                else {
                    // Default to product if uncertain
                    categorized.products.push(file.path);
                }
            }
        }
        return categorized;
    }
    /**
     * Analyze a single image
     */
    async analyzeImage(imagePath, filename) {
        try {
            // 1. Quick filename analysis
            if (filename) {
                const filenameAnalysis = this.analyzeFilename(filename);
                if (filenameAnalysis.confidence > 0.8) {
                    return filenameAnalysis;
                }
            }
            // 2. Get image metadata
            const metadata = await this.getImageMetadata(imagePath);
            // 3. Analyze characteristics
            const characteristics = await this.analyzeCharacteristics(imagePath, metadata);
            // 4. Determine category based on all factors
            return this.categorizeBasedOnCharacteristics(characteristics, filename);
        }
        catch (error) {
            console.error(`Error analyzing image ${imagePath}:`, error);
            return {
                category: 'unknown',
                confidence: 0,
                metadata: {},
                reasoning: `Error: ${error.message}`
            };
        }
    }
    /**
     * Analyze filename for hints about image type
     */
    analyzeFilename(filename) {
        const lower = filename.toLowerCase();
        // Logo patterns
        if (lower.includes('logo') || lower.includes('brand') || lower.includes('icon')) {
            return {
                category: 'logo',
                confidence: 0.95,
                metadata: {},
                reasoning: 'Filename contains logo/brand/icon'
            };
        }
        // Screenshot patterns
        if (lower.includes('screenshot') || lower.includes('screen') ||
            lower.includes('capture') || lower.includes('app') || lower.includes('dashboard')) {
            return {
                category: 'screenshot',
                confidence: 0.9,
                metadata: {},
                reasoning: 'Filename suggests screenshot'
            };
        }
        // Background patterns
        if (lower.includes('background') || lower.includes('bg') ||
            lower.includes('banner') || lower.includes('hero')) {
            return {
                category: 'background',
                confidence: 0.9,
                metadata: {},
                reasoning: 'Filename suggests background'
            };
        }
        // Product patterns
        if (lower.includes('product') || lower.includes('item') ||
            lower.includes('shoe') || lower.includes('dress') || lower.includes('watch')) {
            return {
                category: 'product',
                confidence: 0.85,
                metadata: {},
                reasoning: 'Filename suggests product'
            };
        }
        return {
            category: 'unknown',
            confidence: 0,
            metadata: {},
            reasoning: 'No clear pattern in filename'
        };
    }
    /**
     * Get basic image metadata using sharp
     */
    async getImageMetadata(imagePath) {
        try {
            const image = sharp(imagePath);
            const metadata = await image.metadata();
            const stats = await image.stats();
            return {
                width: metadata.width,
                height: metadata.height,
                hasTransparency: metadata.channels === 4 || metadata.format === 'png',
                aspectRatio: metadata.width && metadata.height ? metadata.width / metadata.height : undefined,
                dominantColors: stats.dominant ? [this.rgbToHex(stats.dominant)] : []
            };
        }
        catch (error) {
            console.error('Error getting metadata:', error);
            return {};
        }
    }
    /**
     * Analyze image characteristics for categorization
     */
    async analyzeCharacteristics(imagePath, metadata) {
        try {
            const image = sharp(imagePath);
            // Check if image is mostly transparent (common for logos)
            if (metadata.hasTransparency) {
                const { data, info } = await image
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                let transparentPixels = 0;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] < 128)
                        transparentPixels++;
                }
                const transparencyRatio = transparentPixels / (info.width * info.height);
                if (transparencyRatio > 0.3) {
                    metadata.isGraphic = true;
                }
            }
            // Detect if image has sharp edges (screenshots, UI)
            const edges = await image
                .greyscale()
                .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
            })
                .raw()
                .toBuffer();
            let edgePixels = 0;
            for (let i = 0; i < edges.length; i++) {
                if (edges[i] > 30)
                    edgePixels++;
            }
            const edgeRatio = edgePixels / edges.length;
            return {
                ...metadata,
                edgeRatio,
                containsText: edgeRatio > 0.1 // High edge ratio often indicates text
            };
        }
        catch (error) {
            console.error('Error analyzing characteristics:', error);
            return metadata;
        }
    }
    /**
     * Categorize based on all characteristics
     */
    categorizeBasedOnCharacteristics(characteristics, filename) {
        const { width = 0, height = 0, hasTransparency, aspectRatio = 1, isGraphic, containsText, edgeRatio = 0 } = characteristics;
        // Logo detection
        if (hasTransparency && isGraphic && width < 1000 && height < 1000) {
            return {
                category: 'logo',
                confidence: 0.85,
                metadata: characteristics,
                reasoning: 'Transparent graphic under 1000px - likely logo'
            };
        }
        // Screenshot detection
        if (containsText && edgeRatio > 0.15 && aspectRatio > 0.5 && aspectRatio < 2) {
            return {
                category: 'screenshot',
                confidence: 0.8,
                metadata: characteristics,
                reasoning: 'High edge ratio with text - likely screenshot'
            };
        }
        // Background detection
        if (aspectRatio > 2.5 || (width > 1920 && height < 800)) {
            return {
                category: 'background',
                confidence: 0.75,
                metadata: characteristics,
                reasoning: 'Wide aspect ratio - likely background/banner'
            };
        }
        // Product detection (default for unclear cases)
        if (!hasTransparency && aspectRatio > 0.7 && aspectRatio < 1.5) {
            return {
                category: 'product',
                confidence: 0.7,
                metadata: characteristics,
                reasoning: 'Square-ish opaque image - likely product'
            };
        }
        return {
            category: 'unknown',
            confidence: 0.3,
            metadata: characteristics,
            reasoning: 'Could not determine category with confidence'
        };
    }
    /**
     * Convert RGB to hex color
     */
    rgbToHex(rgb) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
        return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }
}
