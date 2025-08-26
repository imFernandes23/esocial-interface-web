const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
const asArr = <T extends Element>(x: HTMLCollectionOf<T> | NodeListOf<T>) => Array.prototype.slice.call(x);
const trim = (s: string|null|undefined) => (s??'').replace(/\s+/g,' ').trim();

function getEventLabelFromXsd(xml: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const eSocial = doc.getElementsByTagNameNS(XSD_NS, 'element');
    // procura pelo elemento global eSocial e pega sua documentation
    for (const el of asArr(eSocial)) {
      if (el.parentElement?.localName !== 'schema') continue;
      if (el.getAttribute('name') !== 'eSocial') continue;
      const anns = el.getElementsByTagNameNS(XSD_NS, 'annotation');
      for (const a of asArr(anns)) {
        const docs = a.getElementsByTagNameNS(XSD_NS, 'documentation');
        for (const d of asArr(docs)) {
          const t = trim(d.textContent);
          if (t) return t; // “S-2200 - Cadastramento …” etc.
        }
      }
    }
    return null;
  } catch { return null; }
}

export class XsdIndexerService {
  buildEvents(files: Record<string,string>): Array<{ fileName: string; label: string; isTipos: boolean }> {
    const out: Array<{ fileName: string; label: string; isTipos: boolean }> = [];
    for (const [name, xml] of Object.entries(files)) {
      if (name.toLowerCase().includes('tipos')) {
        out.push({ fileName: name, label: 'tipos', isTipos: true });
        continue;
      }
      const label = getEventLabelFromXsd(xml) || name;
      out.push({ fileName: name, label, isTipos: false });
    }
    // Ordena: tipos primeiro, depois por label
    return out.sort((a,b) => (a.isTipos===b.isTipos ? a.label.localeCompare(b.label) : a.isTipos ? -1 : 1));
  }
}