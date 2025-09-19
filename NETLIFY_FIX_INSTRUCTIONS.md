# Fix Netlify Deployment - IMPORTANT

The issue is that Netlify is not using the netlify.toml from your repository. Here's how to fix it:

## Option 1: Update Netlify UI Settings (Recommended)

1. Go to https://app.netlify.com/sites/fancy-pony-d4b091/settings/deploys

2. Find "Build settings" section

3. Update these fields:
   - **Base directory**: `alter-marketing-site`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `alter-marketing-site/.next`

4. Save the changes

5. Go to "Deploys" tab and click "Trigger deploy" → "Clear cache and deploy site"

## Option 2: Check for Site Configuration File

1. In Netlify dashboard, go to "Site configuration" 
2. Check if there's a "netlify.toml" in the site files that's overriding your repo's netlify.toml
3. If yes, delete it or update it to match our configuration

## Option 3: Link to Correct Directory

If Netlify is deploying from a different directory or branch:

1. Go to "Site settings" → "Build & deploy" → "Continuous Deployment"
2. Check the "Production branch" - should be `main`
3. Check if there's a "Deploy contexts" setting that might be overriding

## The Correct netlify.toml Content

If you need to manually update any netlify.toml, use this:

```toml
[build]
  base = "alter-marketing-site"
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

## Quick Test

After making changes, your site at https://fancy-pony-d4b091.netlify.app should show:
- Purple gradient hero section with "Transform Your Content Creation"
- Modern marketing site design
- NOT the old AdCreator interface

## If Still Not Working

The nuclear option:
1. Disconnect the GitHub repo from Netlify
2. Delete all build settings
3. Reconnect and set base directory to `alter-marketing-site` during setup