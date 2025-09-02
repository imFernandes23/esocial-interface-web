import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveXmlService {
  private doc: Document | null = null;
  private pathSubjects = new Map<string, BehaviorSubject<string>>();

  // Mapa de ordem de filhos por caminho do pai (caminho “visual”, sem [n])
  private parentOrders = new Map<string, string[]>();


  /** Registra a ordem dos filhos (nomes qualificados) de um caminho de pai */
  public registerOrder(parentVisualPath: string, order: string[]) {
    this.parentOrders.set(this.normalizePath(parentVisualPath), order.slice());
  }

  private normalizePath(p: string): string {
    // remove [n] para usarmos um caminho estável como chave (e.g., eSocial/evtTabRubrica/infoRubrica/inclusao/dadosRubrica)
    return p.replace(/\[\d+]/g, '');
  }

  public reemit(prefix?: string): void {
    for (const [p, subj] of this.pathSubjects.entries()) {
      if (!prefix || p.startsWith(prefix)) {
        subj.next(this.getValue(p) ?? ''); // <- usa seu getValue
      }
    }
  }

  
  private emitAll(): void {
    for (const [p, subj] of this.pathSubjects.entries()) {
      subj.next(this.getValue(p) ?? '');
    }
  }

  // private emitAllForExistingSubjects() {
  //   for (const [p, subj] of this.pathSubjects.entries()) {
  //     // getValue não cria nós; só lê
  //     subj.next(this.getValue(p) ?? '');
  //   }
  // }

  init(rootName: string = 'eSocial') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><${rootName}/>`;
    this.doc = new DOMParser().parseFromString(xml, 'application/xml');

    this.ensureDsXmlns();           // <- aqui
    (this as any).emitAll?.();
    (this as any).changed$?.next?.(((this as any).changed$?.value ?? 0) + 1);
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

  private ensureDsXmlns(): void {
    if (!this.doc) return;

    const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
    const root = this.doc.documentElement;
    if (!root) return;

    // Há algum elemento no namespace DS (com ou sem prefixo “ds”)?
    const hasDsElems =
      this.doc.getElementsByTagNameNS(DS_NS, '*').length > 0 ||
      // fallback caso algum parser não suporte bem getElementsByTagNameNS
      this.doc.getElementsByTagName('ds:Signature').length > 0;

    if (hasDsElems && !root.hasAttribute('xmlns:ds')) {
      root.setAttribute('xmlns:ds', DS_NS);
    }
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
    this.ensureDsXmlns();
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
    this.emitAll();
    // this.emitAllForExistingSubjects();
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
    let cur: Element = rootEl;
    let curPathNorm = this.normalizePath(rootEl.tagName); // "eSocial"

    for (let i = 1; i < parts.length; i++) {
      const { name, index } = this.parsePart(parts[i]);
      const next = this.nthChildOrdered(doc, cur, curPathNorm, name, index, create);
      if (!next) return null;

      // atualiza ponteiros para o próximo nível
      cur = next;
      curPathNorm = this.normalizePath(curPathNorm + '/' + name + (index ? `[${index}]` : ''));
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

  /** Retorna o Element para um visualPath (ou null) sem criar nada */
  public resolveElement(path: string): Element | null {
    const doc = this.ensureDoc();
    return this.ensureElement(doc, path, /*create*/ false);
  }

  /** Conta quantas instâncias existem para '.../nome' (sem [n]) ou 0/1 se vier com [n] */
  public count(path: string): number {
    if (!this.doc) return 0;
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return 0;

    // resolve pai
    let el: Element | null = this.doc.documentElement;
    if (!el || el.tagName !== parts[0]) return 0;

    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i].replace(/\[\d+]/, '');
      const kids: any = Array.from(el!.children).filter(e => e.tagName === seg);
      if (kids.length === 0) return 0;
      el = kids[0];
    }
    if (!el) return 0;

    const last = parts[parts.length - 1];
    const seg = last.replace(/\[\d+]/, '');
    return Array.from(el.children).filter(e => e.tagName === seg).length;
  }

  /** Texto do primeiro nó naquele path (ou '') */
  public getText(path: string): string {
    const el = this.resolveElement(path);
    return el?.textContent?.trim() ?? '';
  }

  public validateXml(xml: string): { ok: boolean; error?: string } {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) {
        return { ok: false, error: err.textContent || 'XML inválido' };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'XML inválido' };
    }
  }

  /** Retorna/cria o filho name[index] sob parent (Element) */
  private nthChildOrdered(
    doc: Document,
    parent: Element,
    parentPathNorm: string,
    name: string,
    index: number,
    create = true
  ): Element | null {
    const same = Array.from(parent.children).filter(c => c.tagName === name);
    if (same.length >= index) return same[index - 1];
    if (!create) return null;

    const order = this.parentOrders.get(parentPathNorm);
    const makeOne = (): Element => {
      const el = this.createElementSmart(doc, name);

      // 1) se já há irmãos do MESMO nome, insira logo após o último deles
      const lastSame = Array.from(parent.children).filter(c => c.tagName === name).pop();
      if (lastSame) {
        if (lastSame.nextSibling) parent.insertBefore(el, lastSame.nextSibling);
        else parent.appendChild(el);
        return el;
      }

      // 2) senão, use a ordem registrada para achar o ponto de inserção
      if (order) {
        const myRank = order.indexOf(name);
        if (myRank >= 0) {
          const kids = Array.from(parent.children);
          for (const k of kids) {
            const r = order.indexOf(k.tagName);
            if (r >= 0 && r > myRank) {
              parent.insertBefore(el, k);
              return el;
            }
          }
        }
      }

    // 3) fallback: append no final
    parent.appendChild(el);
    return el;
  };

  // Cria quantas instâncias forem necessárias até alcançar index
  while (Array.from(parent.children).filter(c => c.tagName === name).length < index) {
    makeOne();
  }
  return Array.from(parent.children).filter(c => c.tagName === name)[index - 1] ?? null;
}

  /** Retorna o Element por um path visual (ex.: A/B/C[2]); null se não existir. */
  public getElement(visualPath: string): Element | null {
    if (!this.doc) return null;
    const parts = visualPath.split('/').filter(Boolean);
    if (!parts.length) return null;

    let cur: Element | null = this.doc.documentElement;
    if (!cur || cur.tagName !== parts[0]) return null;

    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i];
      const m = seg.match(/^(.+?)(?:\[(\d+)])?$/);
      const name = m?.[1] ?? seg;
      const idx  = m?.[2] ? parseInt(m![2], 10) : 1;
      const kids: any = Array.from(cur.children).filter(e => e.tagName === name);
      cur = kids[idx - 1] ?? null;
      if (!cur) return null;
    }
    return cur;
  }

/** Garante o caminho (ex.: A/B/C[2]) e retorna o último Element. */
  public ensurePath(visualPath: string): Element {
    if (!this.doc) throw new Error('XML não inicializado.');
    const parts = visualPath.split('/').filter(Boolean);
    if (!parts.length) throw new Error('Path vazio.');

    // raiz
    if (!this.doc.documentElement) {
      const root = this.doc.createElement(parts[0]);
      this.doc.appendChild(root);
    } else if (this.doc.documentElement.tagName !== parts[0]) {
      // se a raiz não bate, cria uma nova raiz simples
      const root = this.doc.createElement(parts[0]);
      this.doc.replaceChild(root, this.doc.documentElement);
    }

    let cur: Element = this.doc.documentElement!;
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i];
      const m = seg.match(/^(.+?)(?:\[(\d+)])?$/);
      const name = m?.[1] ?? seg;
      const idx  = m?.[2] ? parseInt(m![2], 10) : 1;

      let kids = Array.from(cur.children).filter(e => e.tagName === name);
      while (kids.length < idx) {
        const ne = this.doc.createElement(name);
        cur.appendChild(ne);
        kids = Array.from(cur.children).filter(e => e.tagName === name);
      }
      cur = kids[idx - 1];
    }
    return cur;
  }

  /** Remove filhos 'options' diferentes de 'chosen' e garante o escolhido. */
  public setChoice(basePath: string, options: string[], chosen: string | null): void {
    const parent = this.getElement(basePath) ?? this.ensurePath(basePath);

    // 1) remove ramos concorrentes
    for (const c of Array.from(parent.children)) {
      if (options.includes(c.tagName) && c.tagName !== chosen) {
        parent.removeChild(c);
      }
    }
    // 2) cria o escolhido, se houver e se faltar
    if (chosen) {
      const has = Array.from(parent.children).some(e => e.tagName === chosen);
      if (!has) parent.appendChild(this.doc!.createElement(chosen));
    }

    // 3) notificar observadores já registrados (se você usa algum mapa de watchers)
    if (typeof (this as any).emitAll === 'function') {
      (this as any).emitAll();
    }
    if ((this as any).changed$?.next) {
      (this as any).changed$.next(((this as any).changed$.value ?? 0) + 1);
    }
  }
}
