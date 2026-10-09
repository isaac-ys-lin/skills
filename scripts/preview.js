// PowerPoint's own rendering of a deck, page by page: PowerPoint for Mac saves a PDF, pdftoppm rasterizes it.
// node scripts/preview.js deck.pptx out/preview
// PowerPoint is sandboxed, so the deck is copied into its container first; "save as PNG" writes nothing, PDF works.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export function preview(deck, outDir) {
  const box = join(homedir(), 'Library/Containers/com.microsoft.Powerpoint/Data/Documents/clayprint-preview');
  mkdirSync(box, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const name = basename(deck, '.pptx');
  const inBox = join(box, `${name}.pptx`), pdf = join(box, `${name}.pdf`);
  copyFileSync(deck, inBox);
  execFileSync('osascript', ['-e', `
    tell application "Microsoft PowerPoint"
      open POSIX file "${inBox}"
      delay 2
      set p to active presentation
      save p in POSIX file "${pdf}" as save as PDF
      close p saving no
    end tell`], { timeout: 180000 });
  copyFileSync(pdf, join(outDir, `${name}.pdf`));
  // 144 dpi gives 1920×1080 per page, the design size.
  execFileSync('pdftoppm', ['-r', '144', '-png', join(outDir, `${name}.pdf`), join(outDir, 'page')]);
  const pages = readdirSync(outDir).filter((f) => /^page-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const rows = Math.ceil(pages.length / 2);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...pages.flatMap((p) => ['-i', join(outDir, p)]),
    '-filter_complex', `${pages.map((_, i) => `[${i}]scale=960:-1,pad=980:560:10:10:white[p${i}]`).join(';')};${pages.map((_, i) => `[p${i}]`).join('')}xstack=inputs=${pages.length}:layout=${pages.map((_, i) => `${(i % 2) * 980}_${Math.floor(i / 2) * 560}`).join('|')}:fill=white`,
    join(outDir, 'sheet.png')]);
  return pages.map((p) => resolve(outDir, p));
}

if (import.meta.main) {
  const [deck, outDir] = process.argv.slice(2);
  if (!deck || !outDir) {
    console.error('usage: node scripts/preview.js deck.pptx out/preview');
    process.exit(2);
  }
  for (const p of preview(resolve(deck), outDir)) console.log(p);
}
