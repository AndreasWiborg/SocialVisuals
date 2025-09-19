import Link from 'next/link'

export default function ToolsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Text Overlay Tools</h1>
      <p className="text-gray-600 mb-8">Choose a tool to generate social-ready images</p>
      <div className="grid gap-6 max-w-4xl w-full md:grid-cols-2">
        <Link
          href="/wizard"
          className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200"
        >
          <h2 className="text-2xl font-semibold mb-2 text-blue-600">Background Wizard</h2>
          <p className="text-gray-600">
            Start with existing background images and add text overlays using our advanced text fitting system.
          </p>
          <div className="mt-4 text-sm text-gray-500">
            • Use pre-made background images<br/>
            • Automatic contrast optimization<br/>
            • WCAG-compliant text rendering
          </div>
        </Link>
        
        <Link
          href="/wizard-svg"
          className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200"
        >
          <h2 className="text-2xl font-semibold mb-2 text-purple-600">SVG Template Wizard</h2>
          <p className="text-gray-600">
            Use SVG templates from AdCreator2 with dynamic placeholders for colors and images, then add text.
          </p>
          <div className="mt-4 text-sm text-gray-500">
            • Process SVG templates<br/>
            • Replace color and image placeholders<br/>
            • Combine with text overlay system
          </div>
        </Link>
      </div>
      
      <div className="mt-8">
        <Link
          href={"/runs" as any}
          className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors inline-block"
        >
          View Previous Runs
        </Link>
      </div>
    </main>
  )
}
