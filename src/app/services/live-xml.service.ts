import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveXmlService {
  private doc: Document | null = null;
  private pathSubjects = new Map<string, BehaviorSubject<string>>();

  init(rootName: string = 'eSocial') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><${rootName}/>`;
    this.doc = new DOMParser().parseFromString(xml, 'application/xml');
  }

  private ensureDoc(): Document {
    if (!this.doc) this.init('eSocial');
    return this.doc!;
  }

  private readonly NS: Record<string, string> = {
    ds: 'http://www.w3.org/2000/09/xmldsig#',
  };

  observe(path: string): Observable<string> {
    return this.subjectFor(path).asObservable();
  }

  getValue(path: string): string {
    const doc = this.ensureDoc();
    const { attr, elementPath } = this.splitAttr(path);
    const el = this.ensureElement(doc, elementPath, false);
    if (!el) return '';
    return attr ? (el.getAttribute(attr) ?? '') : (el.textContent ?? '');
  }

  setValue(path: string, value: string) {
    const doc = this.ensureDoc();
    const { attr, elementPath } = this.splitAttr(path);
    const el = this.ensureElement(doc, elementPath, true);
    if (!el) return;

    if (attr) {
      el.setAttribute(attr, value ?? '');
    } else {
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(doc.createTextNode(value ?? ''));
    }

    this.subjectFor(path).next(value ?? '');
  }

  serialize(pretty = true): string {
    const doc = this.ensureDoc();
    if (!pretty) return new XMLSerializer().serializeToString(doc);
    return this.prettyFromDoc(doc);
  }

  private prettyFromDoc(doc: Document): string {
    const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
    const pad = (n: number) => '  '.repeat(n);

    const walk = (el: Element, depth: number) => {
      const attrs = Array.from(el.attributes)
        .map(a => `${a.name}="${a.value}"`).join(' ');
      const open = attrs ? `<${el.tagName} ${attrs}>` : `<${el.tagName}>`;

      // Filtra textos vazios
      const kids = Array.from(el.childNodes).filter(n => {
        if (n.nodeType !== Node.TEXT_NODE) return true;
        return (n.nodeValue ?? '').trim() !== '';
      });

      if (kids.length === 0) {
        lines.push(`${pad(depth)}${open.replace('>', '/>')}`);
        return;
      }
      if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) {
        lines.push(`${pad(depth)}${open}${(kids[0].nodeValue ?? '').trim()}</${el.tagName}>`);
        return;
      }

      lines.push(`${pad(depth)}${open}`);
      for (const k of kids) {
        if (k.nodeType === Node.ELEMENT_NODE) {
          walk(k as Element, depth + 1);
        } else if (k.nodeType === Node.TEXT_NODE) {
          lines.push(`${pad(depth + 1)}${(k.nodeValue ?? '').trim()}`);
        }
      }
      lines.push(`${pad(depth)}</${el.tagName}>`);
    };

    walk(doc.documentElement, 0);
    return lines.join('\n');
  }

  debugDump() {
    console.group('[LiveXML dump]');
    for (const [p, subj] of this.pathSubjects.entries()) {
      console.log(p, '=>', subj.getValue());
    }
    console.groupEnd();
  }

  import(xmlString: string) {
    this.doc = new DOMParser().parseFromString(xmlString, 'application/xml');
    const doc = this.ensureDoc();
    const root = doc.documentElement;
    const walk = (el: Element, prefix: string) => {
      // atributos
      for (const a of Array.from(el.attributes)) {
        const p = `${prefix}/@${a.name}`;
        this.subjectFor(p).next(a.value);
      }
      // texto se folha
      const hasChildren = el.children.length > 0;
      const text = (el.textContent ?? '').trim();
      if (!hasChildren && text !== '') this.subjectFor(prefix).next(text);

      // agrupa por tag para indexar [n]
      const byName = new Map<string, Element[]>();
      for (const c of Array.from(el.children)) {
        const arr = byName.get(c.tagName) ?? [];
        arr.push(c);
        byName.set(c.tagName, arr);
      }
      for (const [name, list] of byName.entries()) {
        list.forEach((child, i) => {
          walk(child, `${prefix}/${name}[${i + 1}]`);
        });
      }
    };
    walk(root, root.tagName);
  }

  // ===== Helpers =====

  private ensureNsOnRoot(prefix: string, doc: Document) {
    const root = doc.documentElement;
    const attr = `xmlns:${prefix}`;
    if (!root.hasAttribute(attr)) {
      const uri = this.NS[prefix];
      if (uri) root.setAttribute(attr, uri);
    }
  }

  /** Cria elemento considerando prefixos (ex.: "ds:Signature") */
  private createElementSmart(doc: Document, qname: string): Element {
    if (qname.includes(':')) {
      const [prefix] = qname.split(':', 1);
      const ns = this.NS[prefix];
      const el = ns ? doc.createElementNS(ns, qname) : doc.createElement(qname);
      if (ns) this.ensureNsOnRoot(prefix, doc); // declara xmlns:ds="..."
      return el;
    }
    return doc.createElement(qname);
  }

  private subjectFor(path: string): BehaviorSubject<string> {
    let s = this.pathSubjects.get(path);
    if (!s) {
      s = new BehaviorSubject<string>(this.getValue(path) ?? '');
      this.pathSubjects.set(path, s);
    }
    return s;
  }

  private splitAttr(path: string): { elementPath: string; attr?: string } {
    const idx = path.lastIndexOf('/@');
    return idx >= 0
      ? { elementPath: path.slice(0, idx), attr: path.slice(idx + 2) }
      : { elementPath: path };
  }

  /**
   * Garante/retorna o Element indicado por um visualPath (com [n]).
   * A raiz é sempre única; índices só se aplicam a descendentes.
   */
  private ensureElement(doc: Document, visualElementPath: string, create: boolean): Element | null {
    const parts = visualElementPath.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    // raiz
    const rootSpec = this.parsePart(parts[0]);
    let rootEl = doc.documentElement;
    if (!rootEl || rootEl.tagName !== rootSpec.name) {
      if (!create) return null;
      this.init(rootSpec.name);
      doc = this.ensureDoc();
      rootEl = doc.documentElement;
    }
    // ignoramos qualquer índice na raiz (sempre 1)
    let cur: Element = rootEl;

    // demais partes com suporte a [n]
    for (let i = 1; i < parts.length; i++) {
      const { name, index } = this.parsePart(parts[i]);
      const next = this.nthChild(doc, cur, name, index, create);
      if (!next) return null;
      cur = next;
    }
    return cur;
  }

  private parsePart(part: string): { name: string; index: number } {
    const m = part.match(/^([^\[]+)(?:\[(\d+)])?$/);
    return {
      name: m?.[1] ?? part,
      index: m?.[2] ? parseInt(m[2], 10) : 1
    };
  }

  /** Retorna/cria o filho name[index] sob parent (Element) */
  private nthChild(
    doc: Document,
    parent: Element,
    name: string,
    index: number,
    create = true
  ): Element | null {
    const list = Array.from(parent.children).filter(c => c.tagName === name);
    if (list.length >= index) return list[index - 1];

    if (!create) return null;

    let count = list.length;
    while (count < index) {
      const el = this.createElementSmart(doc, name); // <-- aqui
      parent.appendChild(el);
      count++;
      if (count === index) return el;
    }
    return Array.from(parent.children).filter(c => c.tagName === name)[index - 1] ?? null;
  }

  public ensurePath(visualPath: string): void {
    const doc = this.ensureDoc();
    const { attr, elementPath } = this.splitAttr(visualPath);
    if (attr) return; // por enquanto só elementos
    this.ensureElement(doc, elementPath, /*create*/ true);
  }

private prettyXml(xml: string): string {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];

    const pad = (n: number) => '  '.repeat(n);

    const walk = (el: Element, depth: number) => {
      const attrs = Array.from(el.attributes)
        .map(a => `${a.name}="${a.value}"`).join(' ');
      const open = attrs ? `<${el.tagName} ${attrs}>` : `<${el.tagName}>`;

      // filtra textos vazios
      const kids = Array.from(el.childNodes).filter(n => {
        if (n.nodeType !== Node.TEXT_NODE) return true;
        return (n.nodeValue ?? '').trim() !== '';
      });

      if (kids.length === 0) {
        lines.push(`${pad(depth)}${open.replace('>', '/>')}`);
        return;
      }

      if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) {
        const t = (kids[0].nodeValue ?? '').trim();
        lines.push(`${pad(depth)}${open}${t}</${el.tagName}>`);
        return;
      }

      lines.push(`${pad(depth)}${open}`);
      for (const k of kids) {
        if (k.nodeType === Node.ELEMENT_NODE) {
          walk(k as Element, depth + 1);
        } else if (k.nodeType === Node.TEXT_NODE) {
          lines.push(`${pad(depth + 1)}${(k.nodeValue ?? '').trim()}`);
        }
      }
      lines.push(`${pad(depth)}</${el.tagName}>`);
    };

    walk(doc.documentElement, 0);
    return lines.join('\n');
  } catch {
    return xml;
  }
}
}
