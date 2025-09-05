import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveXmlService {
  private doc: Document | null = null;
  private pathSubjects = new Map<string, BehaviorSubject<string>>();

  // Ordem declarada dos filhos por caminho do pai (caminho “visual”, sem [n])
  private parentOrders = new Map<string, string[]>();

  /** Registra a ordem dos filhos (nomes qualificados) de um caminho de pai */
  public registerOrder(parentVisualPath: string, order: string[]) {
    this.parentOrders.set(this.normalizePath(parentVisualPath), order.slice());
  }

  private normalizePath(p: string): string {
    // remove [n] para usarmos um caminho estável como chave (e.g., eSocial/evt/.../dados)
    return (p || '').replace(/\[\d+]/g, '');
  }

  // ---------------- XML lifecycle ----------------

  init(rootName: string = 'eSocial') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><${rootName}/>`;
    this.doc = new DOMParser().parseFromString(xml, 'application/xml');
    this.ensureDsXmlns();
    this.emitAll();
  }

  private ensureDoc(): Document {
    if (!this.doc) this.init('eSocial');
    return this.doc!;
  }

  private readonly NS: Record<string, string> = {
    ds: 'http://www.w3.org/2000/09/xmldsig#',
  };

  // ---------------- Observability ----------------

  observe(path: string): Observable<string> {
    return this.subjectFor(path).asObservable();
  }

  private subjectFor(path: string): BehaviorSubject<string> {
    let s = this.pathSubjects.get(path);
    if (!s) {
      s = new BehaviorSubject<string>(this.getValue(path) ?? '');
      this.pathSubjects.set(path, s);
    }
    return s;
  }

  private emitAll(): void {
    for (const [p, subj] of this.pathSubjects.entries()) {
      subj.next(this.getValue(p) ?? '');
    }
  }

  // ---------------- Get/Set primitivos ----------------

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

  // ---------------- Serialização ----------------

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

  // ---------------- Debug/import ----------------

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
  }

  // ---------------- Helpers DOM ----------------

  private ensureNsOnRoot(prefix: string, doc: Document) {
    const root = doc.documentElement;
    const attr = `xmlns:${prefix}`;
    if (!root.hasAttribute(attr)) {
      const uri = this.NS[prefix];
      if (uri) root.setAttribute(attr, uri);
    }
  }

  private ensureDsXmlns(): void {
    if (!this.doc) return;
    const root = this.doc.documentElement;
    if (!root) return;

    const DS_NS = this.NS['ds'];
    // se existirem elementos ds:* e o xmlns:ds não estiver na raiz, adiciona
    const hasDsElems =
      this.doc.getElementsByTagNameNS(DS_NS, '*').length > 0 ||
      this.doc.getElementsByTagName('ds:Signature').length > 0;

    if (hasDsElems && !root.hasAttribute('xmlns:ds')) {
      root.setAttribute('xmlns:ds', DS_NS);
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

  private splitAttr(path: string): { elementPath: string; attr?: string } {
    const idx = path.lastIndexOf('/@');
    return idx >= 0
      ? { elementPath: path.slice(0, idx), attr: path.slice(idx + 2) }
      : { elementPath: path };
  }

  private parsePart(part: string): { name: string; index: number } {
    const m = part.match(/^([^\[]+)(?:\[(\d+)])?$/);
    return {
      name: m?.[1] ?? part,
      index: m?.[2] ? parseInt(m[2], 10) : 1
    };
  }

  /**
   * Garante/retorna o Element indicado por um visualPath (com [n]).
   * A raiz é sempre única; índices só se aplicam a descendentes.
   */
  private ensureElement(doc: Document, visualElementPath: string, create: boolean): Element | null {
    const parts = (visualElementPath || '').split('/').filter(Boolean);
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

  /** Retorna o Element para um visualPath (ou null) sem criar nada */
  public resolveElement(path: string): Element | null {
    const doc = this.ensureDoc();
    return this.ensureElement(doc, path, /*create*/ false);
  }

  /** Garante o caminho (ex.: A/B/C[2]) e retorna o último Element. */
  public ensurePath(visualPath: string): Element {
    const doc = this.ensureDoc();
    const { attr, elementPath } = this.splitAttr(visualPath);
    if (attr) throw new Error('ensurePath não manipula atributos.');
    const el = this.ensureElement(doc, elementPath, /*create*/ true);
    if (!el) throw new Error(`Falha ao garantir path: ${visualPath}`);
    return el;
  }

  /** Retorna o Element por um path visual; null se não existir. */
  public getElement(visualPath: string): Element | null {
    return this.resolveElement(visualPath);
  }

  /** Conta quantas instâncias existem para '.../nome' (sem [n]) ou 0/1 se vier com [n] */
  public count(path: string): number {
    const doc = this.ensureDoc();
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return 0;

    const parentParts = parts.slice(0, -1);
    const last = parts[parts.length - 1];
    const m = last.match(/^(.+?)(?:\[(\d+)])?$/);
    const name = m?.[1] ?? last;
    const index = m?.[2] ? parseInt(m![2], 10) : undefined;

    const parent = parentParts.length
      ? this.ensureElement(doc, parentParts.join('/'), false)
      : doc.documentElement;

    if (!parent) return 0;

    const siblings = Array.from(parent.children).filter(el => el.tagName === name);
    if (index != null) return index <= siblings.length ? 1 : 0;
    return siblings.length;
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

  /** Retorna/cria o filho name[index] sob parent (Element) respeitando a ordem registrada */
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

  // ---------------- Aplicação de formulário -> XML ----------------

  /** Garante atributo Id no elemento do evento */
  private makeEventId(cnpj?: string): string {
    const pad = (n: number, l: number) => String(n).padStart(l, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
    const seq = pad(Math.floor(Math.random() * 1e7), 7);
    return `ID${(cnpj ?? '00000000000000')}${ts}${seq}`;
  }

  private ensureEventId(eventPath: string) {
    const el = this.ensurePath(eventPath);
    if (!el.getAttribute('Id')) el.setAttribute('Id', this.makeEventId());
  }

  /** Remove filhos 'options' diferentes de 'chosen' e garante o escolhido */
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
      if (!has) parent.appendChild(this.ensureDoc().createElement(chosen));
    }

    // 3) notifica observers
    this.emitAll();
  }

  /** Ajusta a contagem de instâncias para um basePath (sem [n] no final) */
  private setGroupCount(basePathNoIndex: string, count: number) {
    const doc = this.ensureDoc();
    const parts = basePathNoIndex.split('/').filter(Boolean);
    if (parts.length < 2) return;

    let parent = this.ensureElement(doc, parts.slice(0, -1).join('/'), true);
    if (!parent) return;
    const name = parts[parts.length - 1];

    const same = Array.from(parent.children).filter(c => c.tagName === name) as Element[];
    if (same.length < count) {
      for (let i = same.length + 1; i <= count; i++) {
        this.nthChildOrdered(doc, parent, this.normalizePath(parts.slice(0, -1).join('/')), name, i, true);
      }
    } else if (same.length > count) {
      for (let i = same.length - 1; i >= count; i--) parent.removeChild(same[i]);
    }
  }

  private enforceOrderEverywhere() {
    if (!this.doc) return;
    const reorder = (parent: Element, parentPath: string) => {
      const norm = this.normalizePath(parentPath);
      const order = this.parentOrders.get(norm);
      if (order && parent.children.length > 1) {
        const kids = Array.from(parent.children) as Element[];
        kids.sort((a, b) => {
          const ra = order.indexOf(a.tagName);
          const rb = order.indexOf(b.tagName);
          if (ra < 0 && rb < 0) return 0;
          if (ra < 0) return 1;
          if (rb < 0) return -1;
          return ra - rb;
        });
        for (const k of kids) parent.appendChild(k);
      }
      // desce mantendo índice visual
      let counts: Record<string, number> = {};
      for (const c of Array.from(parent.children) as Element[]) {
        const name = c.tagName;
        const idx = (counts[name] = (counts[name] ?? 0) + 1);
        reorder(c, `${norm}/${name}[${idx}]`);
      }
    };
    reorder(this.doc.documentElement, this.doc.documentElement.tagName);
  }

  private toAbsPath(p: string, eventPath: string): string {
    const cleaned = (p || '').replace(/^\/+/, '');
    if (!cleaned) return eventPath;
    if (cleaned.startsWith(eventPath)) return cleaned;
    const [root, evt] = eventPath.split('/');
    if (cleaned.startsWith(root + '/')) return cleaned;
    if (cleaned.startsWith(evt + '/'))  return `${root}/${cleaned}`;
    return `${eventPath}/${cleaned}`;
  }

  /**
   * Aplica o snapshot do formulário no XML (gera/atualiza a árvore inteira do evento).
   * `snap.choiceMeta` é usado para podar os ramos não escolhidos e garantir o escolhido.
   */
  applySnapshot(
    eventName: string,
    snap: {
      fields: Record<string, { type: 'text'|'number'|'date'|'enum'; value: string }>;
      choices: Record<string, string>;
      groupCounts: Record<string, number>;
      choiceMeta?: Record<string, { basePath: string; optionElementNames: string[]; chosenElementName: string }>;
    },
    rootName: string = 'eSocial'
  ) {
    if (!snap) return;
    const doc = this.ensureDoc();

    // 1) garante eSocial/Evento + Id
    const eventPath = `${rootName}/${eventName}`;
    this.ensurePath(eventPath);
    this.ensureEventId(eventPath);

    // 2) aplica choices primeiro (cria só o ramo escolhido e remove concorrentes)
    const meta = snap.choiceMeta || {};
    for (const [choiceKey, _chosenId] of Object.entries(snap.choices || {})) {
      const m = meta[choiceKey];
      if (!m) continue;
      const baseAbs = this.toAbsPath(m.basePath, eventPath);
      this.setChoice(baseAbs, m.optionElementNames || [], m.chosenElementName || null);
    }

    // 3) aplica quantidades de grupos
    for (const [base, count] of Object.entries(snap.groupCounts || {})) {
      const baseAbs = this.toAbsPath(base, eventPath);
      this.setGroupCount(baseAbs, Number(count) || 0);
    }

    // 4) escreve campos (texto/attr) respeitando o evento como prefixo
    const fields = Object.entries(snap.fields || {});
    // ordena para criar pais antes dos filhos
    fields.sort((a, b) => a[0].split('/').length - b[0].split('/').length);

    for (const [vPath, entry] of fields) {
      const abs = this.toAbsPath(vPath, eventPath);
      const { elementPath, attr } = this.splitAttr(abs);
      const el = this.ensureElement(doc, elementPath, true);
      if (!el) continue;

      const val = (entry?.value ?? '').toString();
      if (attr) {
        el.setAttribute(attr, val);
      } else {
        while (el.firstChild) el.removeChild(el.firstChild);
        if (val !== '') el.appendChild(doc.createTextNode(val));
      }
    }

    // 5) ordena e notifica
    this.enforceOrderEverywhere();
    this.emitAll();
  }

  // ---------------- XML -> Snapshot (para “Aplicar XML ao formulário”) ----------------

  buildSnapshotFromXml(
    xml: string,
    viewRoot: any,                 // árvore de view do evento
    eventName: string,
    rootName = 'eSocial'
  ): {
    fields: Record<string, { type: 'text'|'number'|'date'|'enum', value: string }>,
    groupCounts: Record<string, number>,
    choices: Record<string, string>,
    choiceMeta: Record<string, { basePath: string; optionElementNames: string[]; chosenElementName: string }>
  } {
    const outFields: Record<string, { type: any, value: string }> = {};
    const outGroups: Record<string, number> = {};
    const outChoices: Record<string, string> = {};
    const choiceMeta: Record<string, { basePath: string; optionElementNames: string[]; chosenElementName: string }> = {};

    // parse
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement; // eSocial
    if (!root || root.tagName !== rootName) {
      return { fields: {}, groupCounts: {}, choices: {}, choiceMeta: {} };
    }
    const evt = Array.from(root.children).find(e => e.tagName === eventName);
    if (!evt) {
      return { fields: {}, groupCounts: {}, choices: {}, choiceMeta: {} };
    }

    // helpers
    const lc = (s?: string) => (s || '').toLowerCase();
    const firstElementNameDeep = (n: any): string | null => {
      if (!n) return null;
      if (lc(n.kind) === 'element' && n.name) return n.name;
      for (const c of (n.children || [])) {
        const r = firstElementNameDeep(c);
        if (r) return r;
      }
      return null;
    };

    // conta/pega texto dentro do elemento do evento
    const countIn = (relPath: string): number => {
      const parts = relPath.split('/').filter(Boolean);
      let cur: Element | null = evt;
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2], 10) : undefined;
        const list = Array.from(cur!.children).filter(e => e.tagName === name) as Element[];
        if (i === parts.length - 1 && idx == null) return list.length;
        cur = (idx == null) ? (list[0] ?? null) : (list[idx - 1] ?? null);
        if (!cur) return 0;
      }
      return cur ? 1 : 0;
    };

    const textAt = (relPath: string): string | null => {
      const parts = relPath.split('/').filter(Boolean);
      let cur: Element | null = evt;
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2], 10) : 1;
        const list = Array.from(cur!.children).filter(e => e.tagName === name) as Element[];
        cur = list[idx - 1] ?? null;
        if (!cur) return null;
      }
      const t = (cur.textContent ?? '').trim();
      return t || null;
    };

    const attrAt = (relElementPath: string, attrName: string): string | null => {
      const parts = relElementPath.split('/').filter(Boolean);
      let cur: Element | null = evt;
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2], 10) : 1;
        const list = Array.from(cur!.children).filter(e => e.tagName === name) as Element[];
        cur = list[idx - 1] ?? null;
        if (!cur) return null;
      }
      const v = cur.getAttribute(attrName);
      return (v ?? '').trim() || null;
    };

    // tipo base simples
    const effBase = (n: any): 'text'|'number'|'date'|'enum' => {
      const base = lc(n?.meta?.base || n?.meta?.typeName || '');
      if (base.includes('date')) return 'date';
      if (n?.meta?.numericFacets) return 'number';
      if ((n?.children || []).some((c: any) => lc(c.kind) === 'enumeration')) return 'enum';
      return 'text';
    };

    // visita a view e monta snapshot
    const walk = (n: any, baseRel: string) => {
      if (!n) return;
      const k = lc(n.kind);

      if (k === 'choice') {
        const optionNames = (n.children || [])
          .map((c: any) => firstElementNameDeep(c))
          .filter(Boolean) as string[];

        let chosenName: string | null = null;
        let chosenChildId = '';
        for (const opt of (n.children || [])) {
          const nm = firstElementNameDeep(opt);
          if (!nm) continue;
          const probe = baseRel ? `${baseRel}/${nm}` : nm;
          if (countIn(probe) > 0) {
            chosenName = nm;
            chosenChildId = opt.id;
            break;
          }
        }

        const choiceKey = `${baseRel}::choice@${n.id}`;
        if (chosenName && chosenChildId) {
          outChoices[choiceKey] = chosenChildId;
          choiceMeta[choiceKey] = {
            basePath: baseRel,                        // relativo ao evento
            optionElementNames: Array.from(new Set(optionNames)),
            chosenElementName: chosenName
          };
        }

        // desce apenas no ramo escolhido
        const chosenNode = (n.children || []).find((c: any) => c.id === chosenChildId);
        if (chosenNode && chosenName) {
          walk(chosenNode, baseRel);
        }
        return;
      }

      if (k === 'attribute') {
        const attrName = n.name;
        if (!attrName) return;
        // baseRel aponta para a instância do elemento pai
        const v = attrAt(baseRel, attrName);
        if (v != null) {
          outFields[`${baseRel}/@${attrName}`] = { type: 'text', value: v };
        }
        return;
      }

      if (k === 'element') {
        const name = n.name;
        const baseNoIdx = baseRel ? `${baseRel}/${name}` : name;
        const cnt = countIn(baseNoIdx);

        // repetíveis -> guarda contagem
        const max = n.meta?.occurs?.max;
        const isRepeatable = max === 'unbounded' || (typeof max === 'number' && max > 1);
        if (isRepeatable) outGroups[baseNoIdx] = cnt;

        if ((n.children || []).length) {
          // desce por instância real
          for (let i = 1; i <= Math.max(cnt, 0); i++) {
            for (const c of (n.children || [])) {
              walk(c, `${baseNoIdx}[${i}]`);
            }
          }
        } else {
          // folha
          const t = effBase(n);
          for (let i = 1; i <= Math.max(cnt, 0); i++) {
            const p = `${baseNoIdx}[${i}]`;
            const v = textAt(p);
            if (v != null) outFields[p] = { type: t, value: v };
          }
        }
        return;
      }

      // wrappers / outros: só desce
      if ((n.children || []).length) {
        for (const c of n.children) walk(c, baseRel);
      }
    };

    // começa pelo elemento do evento (na view costuma ser esse element)
    walk(viewRoot, '');

    return { fields: outFields, groupCounts: outGroups, choices: outChoices, choiceMeta };
  }
}
