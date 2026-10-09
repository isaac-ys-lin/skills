// SVG to PNG with resvg, using the system's PingFang so CJK labels match the slides.
// node scripts/png.js in.svg out.png [--scale 2]
// node scripts/png.js --sheet out.png [--width N --height N] examples/*.json   (contact sheet, two columns)
import { readFileSync, writeFileSync, globSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { C, FONT_FAMILY } from './core.js';
import { framed } from './svg.js';
import { isMain } from './main.js';

let pingFangPath;
export function pingFang() {
  if (pingFangPath === undefined) {
    pingFangPath = globSync('/System/Library/AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/PingFang.ttc')[0] ?? null;
  }
  return pingFangPath;
}

const JHENGHEI = ['/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/MSJH.ttf', '/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/MSJHBD.ttf'];

function resvg(svg, opts = {}) {
  const fontFiles = [pingFang(), ...JHENGHEI.filter((f) => existsSync(f))].filter(Boolean);
  return new Resvg(svg, { font: { loadSystemFonts: true, fontFiles, defaultFontFamily: 'PingFang TC' }, ...opts });
}

export function svgToPng(svg, { scale = 1 } = {}) {
  return resvg(svg, { fitTo: { mode: 'zoom', value: scale } }).render().asPng();
}

// Ink width of a label as rendered; used to calibrate textWidth().
export const hasJhengHei = () => existsSync(JHENGHEI[0]);

export function measureText(str, px, font = FONT_FAMILY) {
  const esc = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px * str.length * 2}" height="${px * 2}" font-family="${font}"><text x="0" y="${px * 1.5}" font-size="${px}">${esc}</text></svg>`;
  return resvg(svg).getBBox().width;
}

// Each chart is placed as a translated group, not a nested image: resvg skips fonts inside data-URI images.
export function sheet(files, { columns = 2, gap = 64, size = {} } = {}) {
  const cells = files.map((f) => ({ name: basename(f, '.json'), ...framed(JSON.parse(readFileSync(f, 'utf8')), size) }));
  const cw = Math.max(...cells.map((c) => c.width)), ch = Math.max(...cells.map((c) => c.height)) + 56;
  const rows = Math.ceil(cells.length / columns);
  const W = columns * cw + (columns + 1) * gap, H = rows * (ch + gap) + gap;
  const body = cells.map((c, i) => {
    const x = gap + (i % columns) * (cw + gap), y = gap + Math.floor(i / columns) * (ch + gap);
    return `<g transform="translate(${x} ${y})"><text x="0" y="32" font-size="28" font-weight="600" fill="${C.text}">${c.name}</text><g transform="translate(0 56)">${c.body}</g></g>`;
  }).join('');
  const warnings = cells.flatMap((c) => c.model.warnings.map((w) => `${c.name}：${w}`));
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT_FAMILY}"><rect width="${W}" height="${H}" fill="${C.onDark[0]}"/>${body}</svg>`, warnings };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--sheet') {
    const take = (flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : Number(args.splice(i, 2)[1]); };
    const size = { width: take('--width'), height: take('--height') };
    const [, output, ...files] = args;
    const { svg, warnings } = sheet(files, { size });
    writeFileSync(output, svgToPng(svg, { scale: 0.5 }));
    for (const w of warnings) console.error(`警告：${w}`);
    process.exit(0);
  }
  const scaleAt = args.indexOf('--scale');
  const scale = scaleAt >= 0 ? Number(args.splice(scaleAt, 2)[1]) : 1;
  const [input, output] = args;
  if (!input || !output) {
    console.error('用法：node scripts/png.js in.svg out.png [--scale 2]');
    process.exit(2);
  }
  writeFileSync(output, svgToPng(readFileSync(input, 'utf8'), { scale }));
}
