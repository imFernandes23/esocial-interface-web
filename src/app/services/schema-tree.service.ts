import { Injectable } from '@angular/core';
import { TreeNode } from '../shared/models/schema-models';

const XS = 'http://www.w3.org/2001/XMLSchema';

type Indexes = {
  complex: Map<string, Element>;
  simple:  Map<string, Element>;
  groups:  Map<string, Element>;          // opcional (se usar xs:group)
  attrGroups: Map<string, Element>;       // opcional (se usar xs:attributeGroup)
};

@Injectable({
  providedIn: 'root'
})
export class SchemaTreeService {
  /** Constrói a árvore do EVENTO resolvendo tipos pelo TIPOS.XSD */
  buildEventoTree(eventoXsd: string, tiposXsd: string): TreeNode {
    const docEvt   = parseXml(eventoXsd);
    const docTipos = parseXml(tiposXsd);

    const schemaTipos = getSchemaRoot(docTipos);
    const idx = this.indexGlobal(schemaTipos);

    // elemento raiz do EVENTO (ex.: <xs:element name="evtRemun">)
    const rootEvtEl = findRootEventElement(docEvt);
    if (!rootEvtEl) throw new Error('Elemento raiz do evento não encontrado no XSD do evento.');

    const id = 'schema:evento';
    const rootChildren: TreeNode[] = [];

    // monta nó do elemento raiz + filhos
    rootChildren.push(this.buildElementNode(rootEvtEl, idx, `${id}/el:${getName(rootEvtEl)}`, new Set()));

    return { id, name: rootEvtEl.getAttribute('name') || 'evt', kind: 'schema', children: rootChildren };
  }

  /** Constrói a árvore do TIPOS.XSD (lista todos os globais) */
  buildTiposTree(tiposXsd: string): TreeNode {
    const doc = parseXml(tiposXsd);
    const schema = getSchemaRoot(doc);
    const id = 'schema:tipos';

    const children: TreeNode[] = [];
    for (const el of Array.from(schema.children)) {
      if (el.namespaceURI !== XS) continue;
      if (el.localName === 'complexType') {
        children.push(this.buildComplexTypeNode(el as Element, this.indexGlobal(schema), `${id}/ct:${getName(el)}`, new Set()));
      } else if (el.localName === 'simpleType') {
        children.push(this.buildSimpleTypeNode(el as Element, `${id}/st:${getName(el)}`));
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
    return { complex, simple, groups, attrGroups };
  }

  private buildElementNode(el: Element, idx: Indexes, id: string, visited: Set<string>): TreeNode {
    const name = getName(el) || '(element)';
    const children: TreeNode[] = [];

    // inline types
    const inlineCT = firstChildNS(el, 'complexType');
    if (inlineCT) children.push(this.buildComplexTypeNode(inlineCT, idx, `${id}/ct:inline`, new Set(visited)));
    const inlineST = firstChildNS(el, 'simpleType');
    if (inlineST) children.push(this.buildSimpleTypeNode(inlineST, `${id}/st:inline`));

    // referenced @type
    const type = el.getAttribute('type');
    if (type) {
      const tname = qNameLocal(type);
      if (idx.complex.has(tname) && !visited.has(`ct:${tname}`)) {
        visited.add(`ct:${tname}`);
        children.push(this.buildComplexTypeNode(idx.complex.get(tname)!, idx, `${id}/ct:${tname}`, new Set(visited)));
      } else if (idx.simple.has(tname) && !visited.has(`st:${tname}`)) {
        visited.add(`st:${tname}`);
        children.push(this.buildSimpleTypeNode(idx.simple.get(tname)!, `${id}/st:${tname}`));
      } else {
        children.push({ id: `${id}/type:${type}`, name: `type ${type}`, kind: 'type', children: [] });
      }
    }

    return { id, name, kind: 'element', children };
  }

  private buildComplexTypeNode(ct: Element, idx: Indexes, id: string, visited: Set<string>): TreeNode {
    const name = ct.getAttribute('name') || '(complexType)';
    const children: TreeNode[] = [];

    // complexContent / simples
    let model: Element = ct;
    const complexContent = firstChildNS(ct, 'complexContent');
    if (complexContent) {
      model = complexContent;
      // extension/restriction (opcional — aqui mostramos só o "nome" do base se quiser)
      const ext = firstChildNS(complexContent, 'extension') || firstChildNS(complexContent, 'restriction');
      if (ext) {
        const base = ext.getAttribute('base');
        if (base) {
          children.push({ id: `${id}/base:${base}`, name: `base ${base}`, kind: 'type', children: [] });
        }
        // desce para sequência/choice dentro do extension/restriction
        model = ext;
      }
    }

    // sequence | choice | all
    const group = firstChildNS(model, 'sequence') || firstChildNS(model, 'choice') || firstChildNS(model, 'all');
    if (group) {
      const gNode: TreeNode = { id: `${id}/${group.localName}`, name: group.localName, kind: group.localName, children: [] };
      for (const ch of Array.from(group.children)) {
        if (ch.namespaceURI !== XS) continue;
        if (ch.localName === 'element') {
          gNode.children!.push(this.buildElementNode(ch as Element, idx, `${gNode.id}/el:${getName(ch)}`, new Set(visited)));
        } else if (ch.localName === 'group') {
          const ref = (ch as Element).getAttribute('ref');
          if (ref) gNode.children!.push({ id: `${gNode.id}/group:${ref}`, name: `group ${ref}`, kind: 'group', children: [] });
        }
      }
      children.push(gNode);
    }

    // attributes (+ attributeGroup refs)
    const attrs = Array.from(ct.children).filter(c => c.namespaceURI === XS && c.localName === 'attribute') as Element[];
    const attrRefs = Array.from(ct.children).filter(c => c.namespaceURI === XS && c.localName === 'attributeGroup') as Element[];

    if (attrs.length || attrRefs.length) {
      const aNode: TreeNode = { id: `${id}/attributes`, name: 'attributes', kind: 'attributes', children: [] };
      for (const a of attrs) {
        aNode.children!.push({ id: `${aNode.id}/${getName(a)}`, name: getName(a) || '(attribute)', kind: 'attribute', children: [] });
      }
      for (const ag of attrRefs) {
        const ref = ag.getAttribute('ref') || '';
        aNode.children!.push({ id: `${aNode.id}/attrGroup:${ref}`, name: `attributeGroup ${ref}`, kind: 'attributeGroup', children: [] });
      }
      children.push(aNode);
    }

    return { id, name, kind: 'complexType', children };
  }

  private buildSimpleTypeNode(st: Element, id: string): TreeNode {
    const name = st.getAttribute('name') || '(simpleType)';
    const children: TreeNode[] = [];

    const restr = firstChildNS(st, 'restriction');
    if (restr) {
      const base = restr.getAttribute('base');
      if (base) {
        children.push({ id: `${id}/base:${base}`, name: `base ${base}`, kind: 'type', children: [] });
      }
      const enums = Array.from(restr.children).filter(c => c.namespaceURI === XS && c.localName === 'enumeration') as Element[];
      if (enums.length) {
        const enumNode: TreeNode = { id: `${id}/enumeration`, name: 'enumeration', kind: 'enumeration', children: [] };
        for (const e of enums) {
          const v = e.getAttribute('value') || '(enum)';
          enumNode.children!.push({ id: `${enumNode.id}/${v}`, name: v, kind: 'enumValue', children: [] });
        }
        children.push(enumNode);
      }
    }
    return { id, name, kind: 'simpleType', children };
  }
}

/* ------------- helpers puros ------------- */

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
  // heurística: primeiro xs:element global do schema do evento costuma ser o elemento raiz evt*
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