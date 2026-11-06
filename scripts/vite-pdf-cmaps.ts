// Serves pdf.js Korean CMaps (KSC*, UniKS*, Adobe-Korea1*) same-origin under /cmaps/ (DESIGN 3.9):
// emitted as build assets, served by middleware in dev. No CDN (CLAUDE.md rule 2).
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const KOREAN = /^(KSC|UniKS|Adobe-Korea1)[\w-]*\.bcmap$/;

export function koreanCmapDir(): string {
  return join(dirname(require.resolve('pdfjs-dist/package.json')), 'cmaps');
}

export function koreanCmapFiles(): string[] {
  return readdirSync(koreanCmapDir()).filter((f) => KOREAN.test(f)).sort();
}

export function pdfCmapsPlugin(): Plugin {
  return {
    name: 'open-sermon:pdf-cmaps',
    configureServer(server) {
      server.middlewares.use('/cmaps/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        if (!KOREAN.test(name)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(join(koreanCmapDir(), name)));
      });
    },
    generateBundle() {
      for (const f of koreanCmapFiles()) {
        this.emitFile({ type: 'asset', fileName: `cmaps/${f}`, source: readFileSync(join(koreanCmapDir(), f)) });
      }
    },
  };
}
