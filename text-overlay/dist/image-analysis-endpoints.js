// Image analysis endpoints for the API
// Avoid importing Fastify types here to prevent ESM/namespace typing issues
import { VisualAIService } from './services/visual-ai-service.js';
import { EnhancedVisualAIService } from './services/visual-ai-service-enhanced.js';
import { ColorExtractionService } from './services/color-extraction-service.js';
import { promises as fs } from 'fs';
import path from 'path';
export function registerImageAnalysisEndpoints(app) {
    // Initialize the visual AI service
    const visualAI = process.env.OPENAI_API_KEY
        ? new EnhancedVisualAIService(process.env.OPENAI_API_KEY)
        : new VisualAIService();
    // Analyze multiple images
    app.post('/api/analyze', async (req, reply) => {
        try {
            const body = await req.body;
            const { images } = body; // Array of { filename: string, base64: string }
            if (!images || !Array.isArray(images)) {
                return reply.status(400).send({ error: 'No images provided' });
            }
            // Persist uploads under a session folder so UI can load them later
            const uploadsRoot = path.join(process.cwd(), 'uploads');
            await fs.mkdir(uploadsRoot, { recursive: true });
            const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const sessionDir = path.join(uploadsRoot, sessionId);
            await fs.mkdir(sessionDir, { recursive: true });
            const uploadedFiles = [];
            const fileUrls = {};
            for (const img of images) {
                const buffer = Buffer.from(String(img.base64 || '').split(',')[1] || '', 'base64');
                const safeName = img.filename?.replace(/[^A-Za-z0-9._-]/g, '_') || `upload-${Date.now()}.png`;
                const outPath = path.join(sessionDir, safeName);
                await fs.writeFile(outPath, buffer);
                uploadedFiles.push({ path: outPath, filename: safeName });
                fileUrls[safeName] = `/file?p=${encodeURIComponent(outPath)}`;
            }
            // Process with visual AI
            const categorized = await visualAI.processUserUploads(uploadedFiles);
            // Safety net: ensure every uploaded file is assigned to some category
            try {
                const allPaths = new Set(uploadedFiles.map(f => f.path));
                const used = new Set();
                if (categorized.logo)
                    used.add(categorized.logo);
                for (const p of categorized.products)
                    used.add(p);
                for (const s of categorized.screenshots)
                    used.add(s);
                for (const b of categorized.backgrounds)
                    used.add(b);
                const missing = [...allPaths].filter(p => !used.has(p));
                // Default any leftover to products ("everything else")
                for (const m of missing)
                    categorized.products.push(m);
            }
            catch { }
            // Extract colors
            const colorExtractor = new ColorExtractionService();
            const colors = await colorExtractor.extractBrandColors(categorized);
            // Build filename lookup for analyses mapping
            const pathToFilename = new Map();
            for (const f of uploadedFiles)
                pathToFilename.set(f.path, f.filename);
            return reply.send({
                // Return server-relative URLs that the frontend can render directly
                categorized: {
                    logo: categorized.logo ? `/file?p=${encodeURIComponent(categorized.logo)}` : undefined,
                    products: categorized.products.map(p => `/file?p=${encodeURIComponent(p)}`),
                    screenshots: categorized.screenshots.map(s => `/file?p=${encodeURIComponent(s)}`),
                    backgrounds: categorized.backgrounds.map(b => `/file?p=${encodeURIComponent(b)}`),
                },
                colors,
                // Key analyses by original filename so the client can align
                analyses: Object.fromEntries(Array.from(categorized.analyses.entries()).map(([p, a]) => [pathToFilename.get(p) || p, a])),
                fileUrls,
                sessionId
            });
        }
        catch (error) {
            console.error('Analysis error:', error);
            return reply.status(500).send({ error: 'Analysis failed', detail: error.message });
        }
    });
}
