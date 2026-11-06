// docx: unzip word/document.xml with fflate and read paragraph text with DOMParser (DESIGN 3.9).
// No script evaluation anywhere (CSP). Only the main document part is read.
import { unzipSync } from 'fflate';
import { IngestError } from '../errors';
import { normalizeText } from '../text';

const DOCUMENT_PART = 'word/document.xml';
/** Upper bound for the uncompressed main part (zip-bomb guard). */
const MAX_XML_BYTES = 50 * 1024 * 1024;

function paragraphText(p: Element, W_NS: string): string {
  let out = '';
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== W_NS) continue;
      switch (child.localName) {
        case 't':
          out += child.textContent ?? '';
          break;
        case 'tab':
          out += ' ';
          break;
        case 'br':
        case 'cr':
          out += '\n';
          break;
        case 'p': // nested paragraphs (text boxes) are handled by the outer loop
        case 'instrText': // field codes
        case 'delText': // deleted tracked changes
          break;
        default:
          walk(child);
      }
    }
  };
  walk(p);
  return out;
}

export function parseDocx(bytes: Uint8Array): string {
  let xml: Uint8Array | undefined;
  try {
    const files = unzipSync(bytes, {
      filter: (f) => f.name === DOCUMENT_PART && f.originalSize <= MAX_XML_BYTES,
    });
    xml = files[DOCUMENT_PART];
  } catch {
    throw new IngestError('DOCX_INVALID');
  }
  if (!xml) throw new IngestError('DOCX_INVALID');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(xml);
  } catch {
    throw new IngestError('DOCX_INVALID');
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new IngestError('DOCX_INVALID');
  // The WordprocessingML namespace is taken from the root <w:document> element (no URL in src/).
  const root = doc.documentElement;
  const W_NS = root.namespaceURI;
  if (!W_NS || root.localName !== 'document') throw new IngestError('DOCX_INVALID');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) throw new IngestError('DOCX_INVALID');
  const paragraphs = Array.from(body.getElementsByTagNameNS(W_NS, 'p')).map((p) => paragraphText(p, W_NS));
  return normalizeText(paragraphs.join('\n\n'));
}
