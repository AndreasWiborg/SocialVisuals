# Text Overlay Debug Guide

## Common Issues and Solutions

### 1. Directory Path with Spaces
The current directory path contains spaces ("Mood Tracking App"), which can cause issues with file handling. 

**Solution Options:**
- Move the project to a path without spaces
- OR ensure all file paths are properly quoted in scripts

### 2. Testing the System

Use the debug page to test individual components:
1. Navigate to: `http://localhost:3001/text-overlay-debug`
2. Run tests in this order:
   - Test Health - Verifies API is running
   - Test Templates - Checks template loading
   - Test URL Fetch - Tests web scraping
   - Test Generation - Tests the full pipeline

### 3. Manual API Testing

Test the API directly using curl:

```bash
# Test health
curl http://localhost:3000/health

# List templates
curl http://localhost:3000/templates/list

# Test URL context extraction
curl -X POST http://localhost:3000/ctx/fromUrl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test generation with local generator
curl -X POST http://localhost:3000/pipeline/generateOnComposed \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "classic-canva-template-4",
    "bgPath": "bg-dark.png",
    "ctx": {
      "product": {"name": "Test Product", "benefit": "Saves time"},
      "audience": "Everyone",
      "tone": "friendly",
      "locale": "en-US"
    },
    "useLocal": true,
    "brandColors": ["#0057FF", "#F5F5F5"]
  }'
```

### 4. Check Background Files

Ensure background files exist:
```bash
cd text-overlay
ls -la *.png
```

If missing, create them:
```bash
npm run mkbg:dark
npm run mkbg:light
```

### 5. Environment Variables

If using LLM generation (not local), create `.env` in text-overlay folder:
```
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key-here
```

### 6. CORS Issues

The API is configured to accept requests from:
- http://localhost:3000
- http://localhost:3001

If using different ports, update `src/api.ts` in the text-overlay folder.

### 7. Check Logs

Both servers create log files:
- `text-overlay/server.log`
- `frontend/frontend.log`

Check these for detailed error messages.

### 8. Common Error Messages

**"No templates found"**
- API server not running
- Templates directory not found
- Path resolution issues

**"Generation failed"**
- Missing background file
- Template not found
- Invalid context data

**"URL fetch failed"**
- Network issues
- Invalid URL format
- CORS restrictions

### 9. Quick Fix Script

Run this to ensure everything is set up correctly:

```bash
#!/bin/bash
cd text-overlay

# Build if needed
if [ ! -d "dist" ]; then
  npm run build
fi

# Create backgrounds if missing
if [ ! -f "bg-dark.png" ]; then
  npm run mkbg:dark
fi
if [ ! -f "bg-light.png" ]; then
  npm run mkbg:light
fi

# Start API
npm run start
```