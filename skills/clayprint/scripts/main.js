// True when this module is the script node was asked to run. Works on Node 20+, unlike import.meta.main (Node 24.2+).
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const isMain = (url) => {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); }
  catch { return false; }
};
