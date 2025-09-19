import fs from "fs";
import path from "path";
import { convertLegacyJson } from "./legacyConvert.js";
function getArg(flag, def) {
    const args = process.argv;
    let idx = -1;
    for (let i = args.length - 1; i >= 0; i--) {
        if (args[i] === flag) {
            idx = i;
            break;
        }
    }
    if (idx >= 0 && args[idx + 1])
        return args[idx + 1];
    return def;
}
async function main() {
    const inDir = getArg("--in", "old-templates");
    const outDir = getArg("--out", "templates-new");
    fs.mkdirSync(outDir, { recursive: true });
    const manifest = [];
    for (const f of fs.readdirSync(inDir)) {
        if (!f.toLowerCase().endsWith(".json"))
            continue;
        const src = path.join(inDir, f);
        try {
            const raw = JSON.parse(fs.readFileSync(src, "utf8"));
            const tpl = convertLegacyJson(raw);
            const outName = path.join(outDir, `${tpl.templateId}.json`);
            fs.writeFileSync(outName, JSON.stringify(tpl, null, 2));
            manifest.push({ file: f, out: path.basename(outName), ok: true, areas: tpl.areas.length, roles: [...new Set(tpl.areas.map((a) => a.role))] });
        }
        catch (e) {
            manifest.push({ file: f, ok: false, error: String(e?.message || e) });
        }
    }
    fs.writeFileSync(path.join(outDir, "conversion_manifest.json"), JSON.stringify({ when: new Date().toISOString(), items: manifest }, null, 2));
    console.log(`Converted ${manifest.filter(m => m.ok).length}/${manifest.length} → ${outDir}`);
}
main().catch(e => { console.error(e); process.exit(1); });
