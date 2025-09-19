# Text Overlay System - Local Testing Guide

This guide explains how to run the text-overlay system locally with the new frontend interface.

## Prerequisites

1. **Node.js v20+** - Required for both backend and frontend
2. **macOS dependencies** (for canvas package):
   ```bash
   brew install pkg-config cairo pango libpng jpeg giflib librsvg
   ```

## Setup Instructions

### 1. Start the Text-Overlay API Server

```bash
cd text-overlay

# Install dependencies (if not already done)
npm install

# Build the project
npm run build

# Create default backgrounds
npm run mkbg:dark
npm run mkbg:light

# Start the API server (runs on port 3000)
npm run start
```

The API server will be available at `http://localhost:3000`

### 2. Start the Frontend Development Server

In a new terminal:

```bash
cd frontend

# Install dependencies (if not already done)
npm install

# Start the development server (runs on port 3001)
npm run dev
```

The frontend will be available at `http://localhost:3001`

### 3. Access the Text Overlay Interface

Open your browser and navigate to: `http://localhost:3001/text-overlay`

## How to Use the Text Overlay Interface

### Step 1: Input Content
- **From URL**: Enter a website URL and click "Fetch" to automatically extract product information
- **Manual Input**: Fill in the product details, target audience, and brand voice manually

### Step 2: Select Template
- Choose from available templates in the dropdown
- Each template has different layouts optimized for various use cases

### Step 3: Configure Background
- **Solid Color**: Pick a background color using the color picker
- **Upload Image**: Upload your own background image

### Step 4: Set Brand Colors
- Configure up to 2 brand colors that will be used for text overlays

### Step 5: Generate
- Click "Generate Text Overlays" to create multiple text variations
- The system will generate AI-powered copy optimized for your template

### Step 6: Preview & Download
- Click on any generated variation to see a full preview
- Download the final image using the download button

## API Endpoints Used

The frontend connects to these main API endpoints:

- `GET /templates/list` - Fetches available templates
- `POST /ctx/fromUrl` - Extracts context from a URL
- `POST /pipeline/runLLM` - Generates text overlays and renders images
- `GET /file?p=...` - Serves generated images

## Troubleshooting

### Canvas Installation Issues
If you encounter errors during `npm install` in the text-overlay folder:
```bash
# Ensure Homebrew dependencies are installed
brew install pkg-config cairo pango libpng jpeg giflib librsvg

# Clear npm cache and retry
npm cache clean --force
npm install
```

### Port Conflicts
- API server runs on port 3000
- Frontend runs on port 3001
- Make sure these ports are available

### CORS Issues
The API server is configured to accept requests from `http://localhost:3001`. If you change the frontend port, update the CORS configuration in `text-overlay/src/api.ts`.

## Environment Variables

Create a `.env` file in the text-overlay folder for LLM provider configuration:
```
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key-here
```

## Features of the Text Overlay System

1. **AI-Powered Copy Generation**: Generates marketing copy based on product context
2. **Smart Text Fitting**: Automatically fits text to template areas with optimal font sizes
3. **Multiple Variations**: Creates several text variations with different angles/approaches
4. **Background Support**: Works with solid colors or custom uploaded images
5. **Brand Color Integration**: Applies brand colors to text overlays
6. **Responsive Preview**: Shows real-time preview of generated images
7. **Download Support**: Export final images for use in marketing campaigns

## Next Steps

- Experiment with different templates and content
- Try various background images and brand colors
- Generate multiple variations to find the best copy
- Use the generated images in your marketing campaigns