import { createCanvas } from 'canvas';
function parseArgs() {
    const argv = process.argv.slice(2);
    const outIdx = argv.indexOf('--out');
    const wIdx = argv.indexOf('--w');
    const hIdx = argv.indexOf('--h');
    const hexIdx = argv.indexOf('--hex');
    if (outIdx === -1 || wIdx === -1 || hIdx === -1 || hexIdx === -1) {
        console.error('Usage: makeBg --out <file> --w <px> --h <px> --hex <#RRGGBB>');
        process.exit(1);
    }
    const out = argv[outIdx + 1];
    const w = parseInt(argv[wIdx + 1], 10);
    const h = parseInt(argv[hIdx + 1], 10);
    const hex = argv[hexIdx + 1];
    if (!out || !w || !h || !hex) {
        console.error('Invalid arguments');
        process.exit(1);
    }
    return { out, w, h, hex };
}
async function main() {
    const { out, w, h, hex } = parseArgs();
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    const fs = await import('fs');
    const fmt = out.toLowerCase().endsWith('.jpg') || out.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    let buf;
    if (fmt === 'image/jpeg') {
        // Cast any for optional options to satisfy types across canvas versions
        buf = canvas.toBuffer('image/jpeg', { quality: 0.9 });
    }
    else {
        buf = canvas.toBuffer('image/png');
    }
    fs.writeFileSync(out, buf);
    console.log('Wrote', out);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
