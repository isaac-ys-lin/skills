// Render a deck page by page: PowerPoint for Mac or LibreOffice saves a PDF, then pdftoppm rasterizes it.
// node scripts/preview.js deck.pptx out/preview
// PowerPoint is sandboxed, so the deck is copied into its container first; "save as PNG" writes nothing, PDF works.
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { isMain } from './main.js';

// Find a program on PATH. Windows programs carry an extension from PATHEXT (soffice.exe, tool.cmd).
export function executable(name, { platform = process.platform, env = process.env } = {}) {
  const exts = platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : delimiter)) {
    for (const ext of exts) {
      const path = join(dir || '.', name + ext);
      try { accessSync(path, platform === 'win32' ? constants.F_OK : constants.X_OK); return path; } catch { /* keep looking */ }
    }
  }
  return null;
}

export function preview(deck, outDir) {
  mkdirSync(outDir, { recursive: true });
  const name = basename(deck, '.pptx');
  const outPdf = join(outDir, `${name}.pdf`);
  if (process.platform === 'darwin' && existsSync('/Applications/Microsoft PowerPoint.app') && executable('osascript')) {
    const box = join(homedir(), 'Library/Containers/com.microsoft.Powerpoint/Data/Documents/clayprint-preview');
    mkdirSync(box, { recursive: true });
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
    copyFileSync(pdf, outPdf);
  } else {
    const installed = [
      ...(process.platform === 'darwin' ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice'] : []),
      ...(process.platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
        .map((dir) => join(dir, 'LibreOffice', 'program', 'soffice.exe')) : []),
    ];
    const soffice = executable('soffice') ?? installed.find((path) => existsSync(path)) ?? null;
    if (!soffice) throw new Error('找不到 PowerPoint 或 LibreOffice。請安裝 LibreOffice（soffice），或改看 SVG／PNG 圖表。');
    rmSync(outPdf, { force: true });
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', resolve(outDir), resolve(deck)], { timeout: 180000 });
    if (!existsSync(outPdf)) throw new Error('LibreOffice 未產生 PDF，請檢查簡報檔與轉檔訊息。');
    console.warn('LibreOffice 會使用替代字型；此預覽只能檢查版面，請用 PowerPoint 確認正式外觀。');
  }
  // 144 dpi gives 1920×1080 per page, the design size.
  execFileSync('pdftoppm', ['-r', '144', '-png', outPdf, join(outDir, 'page')]);
  const pages = readdirSync(outDir).filter((f) => /^page-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...pages.flatMap((p) => ['-i', join(outDir, p)]),
    '-filter_complex', `${pages.map((_, i) => `[${i}]scale=960:-1,pad=980:560:10:10:white[p${i}]`).join(';')};${pages.map((_, i) => `[p${i}]`).join('')}xstack=inputs=${pages.length}:layout=${pages.map((_, i) => `${(i % 2) * 980}_${Math.floor(i / 2) * 560}`).join('|')}:fill=white`,
    join(outDir, 'sheet.png')]);
  return pages.map((p) => resolve(outDir, p));
}

if (isMain(import.meta.url)) {
  const [deck, outDir] = process.argv.slice(2);
  if (!deck || !outDir) {
    console.error('用法：node scripts/preview.js deck.pptx out/preview');
    process.exit(2);
  }
  for (const p of preview(resolve(deck), outDir)) console.log(p);
}
