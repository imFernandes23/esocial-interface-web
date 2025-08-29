import { Injectable } from '@angular/core';
import { OccursMeta, TreeNode, ViewNode } from '../shared/models/schema-models';
import { collectNumericFacets, inferMaxFromTypeName, inferMinMaxFromPatterns, inferMinMaxFromTypeName } from '../shared/utils/xml-kit';

const XS = 'http://www.w3.org/2001/XMLSchema';

type Indexes = {
  complex: Map<string, Element>;
  simple:  Map<string, Element>;
  groups:  Map<string, Element>;
  attrGroups: Map<string, Element>;
  docs: Document[]; // para fallback de busca global
};

@Injectable({ providedIn: 'root' })
export class SchemaTreeService {

  /** Monta a árvore do EVENTO resolvendo tipos via TIPOS + EVENTO (índice mesclado) */
  buildEventoTree(eventoXsd: string, tiposXsd: string): TreeNode {
    const docEvt   = parseXml(eventoXsd);
    const docTipos = parseXml(tiposXsd);

    const schemaEvt   = getSchemaRoot(docEvt);
    const schemaTipos = getSchemaRoot(docTipos);

    const idxEvt   = this.indexGlobal(schemaEvt);
    const idxTipos = this.indexGlobal(schemaTipos);
    const idx      = this.mergeIndexes(idxTipos, idxEvt);       // TIPOS + EVENTO
    idx.docs = [docTipos, docEvt];                               // fallback

    const rootEvtEl = findRootEventElement(docEvt);
    if (!rootEvtEl) throw new Error('Elemento raiz do evento não encontrado.');

    const id = 'schema:evento';
    const rootChildren: TreeNode[] = [
      this.buildElementNode(rootEvtEl, idx, `${id}/el:${getName(rootEvtEl)}`, new Set())
    ];

    return { id, name: rootEvtEl.getAttribute('name') || 'evt', kind: 'schema', children: rootChildren };
  }

  /** Monta a árvore do TIPOS.XSD (lista tipos globais) */
  buildTiposTree(tiposXsd: string): TreeNode {
    const doc = parseXml(tiposXsd);
    const schema = getSchemaRoot(doc);
    const id = 'schema:tipos';
    const idx = this.indexGlobal(schema);
    idx.docs = [doc];

    const children: TreeNode[] = [];
    for (const el of Array.from(schema.children)) {
      if (el.namespaceURI !== XS) continue;
      if (el.localName === 'complexType') {
        children.push(this.buildComplexTypeNode(el as Element, idx, `${id}/ct:${getName(el)}`, new Set()));
      } else if (el.localName === 'simpleType') {
        children.push(this.buildSimpleTypeNode(el as Element, `${id}/st:${getName(el)}`, idx, new Set()));
      } else if (el.localName === 'group' || el.localName === 'attributeGroup') {
        children.push({
          id: `${id}/${el.localName}:${getName(el)}`,
          name: `${el.localName} ${getName(el) || ''}`.trim(),
          kind: el.localName,
          children: []
        });
      }
    }

    return { id, name: 'tipos.xsd', kind: 'schema', children };
  }

  /* ===================== Internals ===================== */

  private indexGlobal(schema: Element): Indexes {
    const complex = new Map<string, Element>();
    const simple  = new Map<string, Element>();
    const groups  = new Map<string, Element>();
    const attrGroups = new Map<string, Element>();

    for (const ch of Array.from(schema.children)) {
      if (ch.namespaceURI !== XS) continue;
      const name = (ch as Element).getAttribute('name');
      if (!name) continue;
      switch (ch.localName) {
        case 'complexType': complex.set(name, ch as Element); break;
        case 'simpleType':  simple.set(name,  ch as Element); break;
        case 'group':       groups.set(name,  ch as Element); break;
        case 'attributeGroup': attrGroups.set(name, ch as Element); break;
      }
    }
    return { complex, simple, groups, attrGroups, docs: [] };
  }

  private mergeIndexes(a: Indexes, b: Indexes): Indexes {
    const mergeMap = (m1: Map<string, Element>, m2: Map<string, Element>) => {
      const out = new Map(m1);
      for (const [k, v] of m2) if (!out.has(k)) out.set(k, v);
      return out;
    };
    return {
      complex: mergeMap(a.complex, b.complex),
      simple:  mergeMap(a.simple,  b.simple),
      groups:  mergeMap(a.groups,  b.groups),
      attrGroups: mergeMap(a.attrGroups, b.attrGroups),
      docs: [...a.docs, ...b.docs],
    };
  }

  private buildElementNode(el: Element, idx: Indexes, id: string, visited: Set<string>): TreeNode {
  const name = getName(el) || '(element)';
  const children: TreeNode[] = [];
  const meta: { base?: string; typeName?: string; docs?: string[]; occurs?: OccursMeta } = {};
  const minAttr = el.getAttribute('minOccurs');
  const maxAttr = el.getAttribute('maxOccurs');

  // capturar ocorrencias
  if (minAttr || maxAttr) {
    meta.occurs = {
      min: minAttr ? Number(minAttr) : 1,
      max: maxAttr === 'unbounded' ? 'unbounded' : (maxAttr ? Number(maxAttr) : 1),
    }
  }

  // docs do próprio <xs:element>

  const docs = collectDocs(el);
  if (docs.length) meta.docs = docs;

  // inline complexType
  const inlineCT = firstChildNS(el, 'complexType');
  if (inlineCT) {
    children.push(this.buildComplexTypeNode(inlineCT, idx, `${id}/ct:inline`, new Set(visited)));
  }

  // inline simpleType → lê a base e já sobe para o element
  const inlineST = firstChildNS(el, 'simpleType');
  if (inlineST) {
    const stNode = this.buildSimpleTypeNode(inlineST, `${id}/st:inline`, idx, new Set(visited));
    children.push(stNode);
    if (stNode.meta?.base) meta.base = stNode.meta.base;        // 👈 promove para o element
  }

  // referenciado por @type
  const type = el.getAttribute('type');
  if (type) {
    meta.typeName = type; 
    const tname = qNameLocal(type);
    if (idx.complex.has(tname) && !visited.has(`ct:${tname}`)) {
      const next = new Set(visited); next.add(`ct:${tname}`);
      children.push(this.buildComplexTypeNode(idx.complex.get(tname)!, idx, `${id}/ct:${tname}`, next));
    } else if (idx.simple.has(tname) && !visited.has(`st:${tname}`)) {
      const next = new Set(visited); next.add(`st:${tname}`);
      const stNode = this.buildSimpleTypeNode(idx.simple.get(tname)!, `${id}/st:${tname}`, idx, next);
      children.push(stNode);
      if (stNode.meta?.base) meta.base = stNode.meta.base;
      if (!meta.base && stNode.meta?.base) meta.base = stNode.meta.base; // 👈 promove base do tipo referenciado
    } else {
      // fallback (procura globalmente)
      const foundCT = findGlobalByName(idx.docs, 'complexType', tname);
      const foundST = !foundCT && findGlobalByName(idx.docs, 'simpleType', tname);
      if (foundCT && !visited.has(`ct:${tname}`)) {
        const next = new Set(visited); next.add(`ct:${tname}`);
        children.push(this.buildComplexTypeNode(foundCT, idx, `${id}/ct:${tname}`, next));
      } else if (foundST && !visited.has(`st:${tname}`)) {
        const next = new Set(visited); next.add(`st:${tname}`);
        const stBuilt = this.buildSimpleTypeNode(foundST, `${id}/st:${tname}`, idx, next);
        children.push(stBuilt);
        if (!meta.base && stBuilt.meta?.base) meta.base = stBuilt.meta.base; // 👈 promove
      } else {
        children.push({ id: `${id}/type:${type}`, name: `type ${type}`, kind: 'type', children: [] });
      }
    }
  }

  // monta o nó do element com meta (se tiver)
  const node: any = { id, name, kind: 'element', children };
  if (Object.keys(meta).length) node.meta = meta;
  return node as TreeNode;
  }

  private buildComplexTypeNode(ct: Element, idx: Indexes, id: string, visited: Set<string>): TreeNode {
    const name = ct.getAttribute('name') || '(complexType)';
    const children: TreeNode[] = [];
    const meta: { docs?: string[] } = {};

    const docs = collectDocs(ct);
    if (docs.length) meta.docs = docs;
    

    // complexContent (extension/restriction)
    let model: Element = ct;
    const complexContent = firstChildNS(ct, 'complexContent');
    if (complexContent) {
      const extOrRes = firstChildNS(complexContent, 'extension') || firstChildNS(complexContent, 'restriction');
      if (extOrRes) {
        const base = extOrRes.getAttribute('base');
        if (base) children.push({ id: `${id}/base:${base}`, name: `base ${base}`, kind: 'type', children: [] });
        model = extOrRes;
      } else {
        model = complexContent;
      }
    }

    // grupo recursivo (sequence | choice | all) — pode ser aninhado
    const group = firstChildNS(model, 'sequence') || firstChildNS(model, 'choice') || firstChildNS(model, 'all');
    if (group) {
      const next = new Set(visited);
      children.push(this.buildGroupNode(group, idx, `${id}/${group.localName}`, next));
    }

    // atributos + attributeGroup refs
    const attrs = Array.from(ct.children).filter(c => c.namespaceURI === XS && c.localName === 'attribute') as Element[];
    const attrRefs = Array.from(ct.children).filter(c => c.namespaceURI === XS && c.localName === 'attributeGroup') as Element[];

    if (attrs.length || attrRefs.length) {
      const aNode: TreeNode = { id: `${id}/attributes`, name: 'attributes', kind: 'attributes', children: [] };
      for (const a of attrs) {
        const aName = getName(a) || '(attribute)';
        const aMeta: any = {};
        const aChildren: TreeNode[] = [];

        // docs
        const docs = collectDocs(a);
        if (docs.length) aMeta.docs = docs;

        // use (required/optional/prohibited)
        const use = a.getAttribute('use');
        if (use) aMeta.use = use;

        // type (resolve igual em element)
        const type = a.getAttribute('type');
        if (type) {
          aMeta.typeName = type;
          const tname = qNameLocal(type);

          if (idx.simple.has(tname)) {
            const stNode = this.buildSimpleTypeNode(idx.simple.get(tname)!, `${aNode.id}/${aName}/st:${tname}`, idx, new Set());
            aChildren.push(stNode);
            if (stNode.meta?.base) aMeta.base = stNode.meta.base;
          } else if (idx.complex.has(tname)) {
            const ctNode = this.buildComplexTypeNode(idx.complex.get(tname)!, idx, `${aNode.id}/${aName}/ct:${tname}`, new Set());
            aChildren.push(ctNode);
          } else {
            aChildren.push({ id: `${aNode.id}/${aName}/type:${type}`, name: `type ${type}`, kind: 'type', children: [] });
          }
        }

        aNode.children!.push({
          id: `${aNode.id}/${aName}`,
          name: aName,
          kind: 'attribute',
          children: aChildren,
          meta: aMeta
        });
      }
      for (const ag of attrRefs) {
        const ref = ag.getAttribute('ref') || '';
        aNode.children!.push({ id: `${aNode.id}/attrGroup:${ref}`, name: `attributeGroup ${ref}`, kind: 'attributeGroup', children: [] });
      }
      children.push(aNode);
    }

    const node: any = { id, name, kind: 'complexType', children };
    if (meta.docs?.length) node.meta = meta;
    return node as TreeNode;
  }

  /** sequence/choice/all recursivo (desce em sub-grupos também) */
  private buildGroupNode(groupEl: Element, idx: Indexes, id: string, visited: Set<string>): TreeNode {
    const node: TreeNode = { id, name: groupEl.localName, kind: groupEl.localName, children: [] };

    for (const ch of Array.from(groupEl.children)) {
      if (ch.namespaceURI !== XS) continue;

      if (ch.localName === 'element') {
        // cada filho recebe um visited clonado (ciclo por caminho)
        node.children!.push(
          this.buildElementNode(ch as Element, idx, `${id}/el:${getName(ch)}`, new Set(visited))
        );
        continue;
      }

      if (ch.localName === 'sequence' || ch.localName === 'choice' || ch.localName === 'all') {
        node.children!.push(
          this.buildGroupNode(ch as Element, idx, `${id}/${ch.localName}`, new Set(visited))
        );
        continue;
      }

      if (ch.localName === 'group') {
        const ref = (ch as Element).getAttribute('ref') || '';
        node.children!.push({ id: `${id}/group:${ref}`, name: `group ${ref}`, kind: 'group', children: [] });
        continue;
      }
    }
    return node;
  }

private buildSimpleTypeNode(st: Element, id: string, idx: Indexes, visited = new Set<string>()): TreeNode {
  const name = st.getAttribute('name') || '(simpleType)';
  const children: TreeNode[] = [];
  let base: string | undefined;

  const meta: any = {};
  const docs = collectDocs(st);
  if (docs.length) meta.docs = docs;

  const restr = firstChildNS(st, 'restriction');
  if (restr) {
    base = restr.getAttribute('base') || undefined;
    meta.base = base;

    const isNumericBase = !!base?.toLowerCase().match(/^xs:(byte|short|int|integer|long|nonnegativeinteger|nonpositiveinteger|positiveinteger|negativeinteger|unsignedByte|unsignedShort|unsignedInt|unsignedLong|decimal)$/);
    if (isNumericBase) {
      const nf = collectNumericFacets(restr);
      if (Object.keys(nf).length) meta.numericFacets = nf;
      // inferir min/max do nome, se não existirem limites explícitos -> inferir pelos patterns
      const hasExplicitMin = nf.minInclusive !== undefined || nf.minExclusive !== undefined;
      const hasExplicitMax = nf.maxInclusive !== undefined || nf.maxExclusive !== undefined;
      if ((!hasExplicitMin || !hasExplicitMax) && (nf.pattern || (nf.enums?.length))) {
        const inferred = inferMinMaxFromPatterns(nf.pattern ? [nf.pattern] : undefined);
        if (inferred) (meta as any).inferred = { ...((meta as any).inferred||{}), ...inferred };
      }
      if (nf.enums?.length) (meta as any).hasNumericEnums = true;
    }

  if (base && base.toLowerCase().endsWith(':string')) {
    const f = collectStringFacets(restr);       
    if (f.length || f.minLength || f.maxLength || (f.patterns?.length)) {
      meta.stringFacets = f;  
    }
    if (!f.length && !f.maxLength) {
      const inferred = inferMaxFromTypeName(getName(st)); // getName(st) = "TS_nrProc_17_20_21"
      if (inferred !== undefined) {
        (meta as any).inferred = { maxLengthFromName: inferred };
      }
    }
  }

    const restrDocs = collectDocs(restr);
    if (restrDocs.length) meta.docs = [...(meta.docs || []), ...restrDocs];

    base = restr.getAttribute('base') || undefined;
    meta.base = base;

    // 1) facets comuns (mostra algo útil mesmo sem enum)
    for (const facet of Array.from(restr.children)) {
      if (facet.namespaceURI !== XS) continue;
      const ln = facet.localName;
      if (['enumeration','pattern','length','minLength','maxLength','totalDigits','fractionDigits','minInclusive','maxInclusive','minExclusive','maxExclusive'].includes(ln)) {
        if (ln === 'enumeration') continue; // trataremos logo abaixo
        const val = (facet as Element).getAttribute('value') || '';
        children.push({ id: `${id}/${ln}:${val}`, name: `${ln}: ${val}`, kind: ln, children: [] });
      }
    }

    // 2) enumeration (se houver)
    const enums = Array
      .from(restr.children)
      .filter(c => c.namespaceURI === XS && c.localName === 'enumeration') as Element[];
    if (enums.length) {
      const enumNode: TreeNode = { id: `${id}/enumeration`, name: 'enumeration', kind: 'enumeration', children: [] };
      for (const e of enums) {
        const v = e.getAttribute('value') || '(enum)';
        const docs = collectDocs(e);
        const n: any = { id: `${enumNode.id}/${v}`, name: v, kind: 'enumValue', children: []}
        if(docs.length) n.meta = { docs }
        enumNode.children!.push(n);
      }
      children.push(enumNode);
    }

    // 3) se a base for um tipo nomeado (não xs:*), resolver e renderizar como filho
    if (base) {
      const local = qNameLocal(base);
      const isBuiltin = /^xs?:/.test(base) || base.startsWith('xs:') || base === 'string' || base === 'byte';
      if (!isBuiltin) {
        // evitar ciclo
        if (!visited.has(`st:${local}`)) {
          const foundST = idx.simple.get(local) || findGlobalByName(idx.docs, 'simpleType', local);
          if (foundST) {
            const next = new Set(visited); next.add(`st:${local}`);
            const baseNode = this.buildSimpleTypeNode(foundST, `${id}/st:${local}`, idx, next);
            children.unshift(baseNode); // mostrar o tipo-base primeiro
          } else {
            // não achou? pelo menos mostra como "type ..."
            children.unshift({ id: `${id}/type:${base}`, name: `type ${base}`, kind: 'type', children: [] });
          }
        }
      }
    }
  }

  const node: any = { id, name, kind: 'simpleType', children };
  if (Object.keys(meta).length) node.meta = meta;
  return node as TreeNode;
}
  
}

/* ---------------- helpers puros ---------------- */

type StringFacets = {
  length?: number;
  minLength?: number;
  maxLength?: number;
  patterns?: string[];   // múltiplos pattern = AND em XSD
};

  function collectStringFacets(restr: Element): StringFacets {
    const XS = 'http://www.w3.org/2001/XMLSchema';
    const f: StringFacets = {};
    for (const c of Array.from(restr.children)) {
      if (c.namespaceURI !== XS) continue;
      const e = c as Element;
      const v = e.getAttribute('value');
      switch (e.localName) {
        case 'length':       f.length    = v ? Number(v) : undefined; break;
        case 'minLength':    f.minLength = v ? Number(v) : undefined; break;
        case 'maxLength':    f.maxLength = v ? Number(v) : undefined; break;
        case 'pattern':     (f.patterns ??= []).push(v ?? ''); break;
      }
    }
    return f;
  }

  function collectDocs(el: Element): string[] {
    const out: string[] = [];
    for (const ann of Array.from(el.children)) {
      if (ann.namespaceURI !== XS || ann.localName !== 'annotation') continue;
      for (const c of Array.from(ann.children)) {
        if (c.namespaceURI === XS && c.localName === 'documentation') {
          const txt = (c.textContent || '').trim().replace(/\s+/g, ' ');
          if (txt) out.push(txt);
        }
      }
    }
    return out;
  }

  const OMIT_KINDS = new Set<string>([
    'complexType', 'sequence', 'choice', 'all', 'attributes'
    // se quiser, adicione 'attributes' para esconder o grupo de atributos
  ]);

  export function buildViewTree(root: TreeNode, omitKinds = OMIT_KINDS): ViewNode {
    // cria o nó de view correspondente ao root
    const view: ViewNode = {
      id: root.id,
      name: root.name,
      kind: root.kind,
      source: root,
      meta: root.meta ? { ...root.meta } : undefined,
      children: [],
    };

    if (!root.children?.length) return view;

    for (const ch of root.children) {
      if (omitKinds.has(ch.kind)) {
        const promoted = buildViewTree(ch, omitKinds).children ?? [];
        for (const p of promoted) view.children!.push(p);
      } else {
        // mantém o nó normalmente
        view.children!.push(buildViewTree(ch, omitKinds));
      }
    }
    return view;
  }

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML inválido: ' + err.textContent);
  return doc;
}

function getSchemaRoot(doc: Document): Element {
  const byNs = doc.getElementsByTagNameNS(XS, 'schema')?.[0];
  if (byNs) return byNs;
  if (doc.documentElement?.localName === 'schema') return doc.documentElement;
  throw new Error('Root <schema> não encontrado.');
}

function findRootEventElement(doc: Document): Element | null {
  const schema = getSchemaRoot(doc);
  for (const ch of Array.from(schema.children)) {
    if (ch.namespaceURI === XS && ch.localName === 'element') return ch as Element;
  }
  return null;
}

function firstChildNS(parent: Element, local: string): Element | null {
  for (const c of Array.from(parent.children)) {
    if (c.namespaceURI === XS && c.localName === local) return c as Element;
  }
  return null;
}

function getName(el: Element): string {
  return el.getAttribute('name') || el.getAttribute('ref') || '';
}

function qNameLocal(q: string): string {
  const i = q.indexOf(':');
  return i >= 0 ? q.slice(i + 1) : q;
}

/** Fallback: busca global por tipo [complexType|simpleType] com @name */
function findGlobalByName(docs: Document[], localName: 'complexType'|'simpleType', name: string): Element | null {
  for (const doc of docs) {
    const els = doc.getElementsByTagNameNS(XS, localName);
    for (const el of Array.from(els)) {
      if (el.getAttribute('name') === name) return el;
    }
  }
  return null;
}
