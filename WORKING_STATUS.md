# Text Overlay System - Working Status

## ✅ What's Working

### API Server (Port 3000)
- **Status**: Running and healthy
- **Templates**: Loading correctly (found 30+ templates)
- **URL Fetching**: Working (extracts content from websites)
- **Image Generation**: Working (creates overlay images successfully)
- **File Serving**: Working (serves generated images)

### Frontend (Port 3001)
- **Status**: Running
- **Debug Page**: Available at `/text-overlay-debug`
- **Main Page**: Available at `/text-overlay`

## 🔧 How to Use

### 1. Access the Text Overlay Tool
Navigate to: `http://localhost:3001/text-overlay`

### 2. Fill in Content Details
Either:
- **From URL**: Enter a website URL (e.g., https://google.com) and click "Fetch"
- **Manual**: Fill in product name, benefit, and audience

### 3. Generate
- Keep the default template selected
- Click "Generate Text Overlays"
- Wait for the image to appear in the preview

## 📝 Test Commands

Test the API directly:

```bash
# Check if API is running
curl http://localhost:3000/health

# Generate a test image
curl -X POST http://localhost:3000/pipeline/generateOnComposed \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "classic-canva-template-4",
    "bgPath": "bg-dark.png",
    "ctx": {
      "product": {"name": "Your Product", "benefit": "Amazing benefits"},
      "audience": "Your target audience",
      "tone": "friendly",
      "locale": "en-US"
    },
    "useLocal": true,
    "brandColors": ["#0057FF", "#F5F5F5"]
  }'
```

## 🐛 Troubleshooting

If the frontend shows errors:
1. Check browser console for detailed errors (F12 > Console)
2. Use the debug page: `http://localhost:3001/text-overlay-debug`
3. Verify API is running: `curl http://localhost:3000/health`

## 📸 Generated Images

Images are saved in the text-overlay folder with names like:
- `out_llm_[timestamp].png`

You can view them directly or through the frontend preview.