import { Injectable } from '@angular/core';
import { findSimpleTypeRestriction, XS } from '../shared/utils/xml-kit';

type ApplyResult = {
  eventoXml: string;
  tiposXml: string;
  changes: number;
  report: string[];
};

@Injectable({ providedIn: 'root' })
export class XsdMutationService {
  private XS = 'http://www.w3.org/2001/XMLSchema';

  applyEnumRemovals(eventoXml: string, tiposXml: string, removalKeys: string[]): ApplyResult {
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);

    const eventoDoc = parse(eventoXml);
    const tiposDoc  = parse(tiposXml);

    let changes = 0;
    const report: string[] = [];

    for (const key of removalKeys) {
      // key = "<contextId>|<value>", ex:  "schema:evento/.../enumeration|2"
      const pipe = key.lastIndexOf('|');
      if (pipe < 0) continue;
      const contextId = key.slice(0, pipe);
      const value = key.slice(pipe + 1);

      // heurística: se o contextId contém "st:<NAME>" usamos o simpleType global <NAME>
      const stMatch = contextId.match(/\/st:([A-Za-z_][\w.-]*)/g);
      const lastSt  = stMatch ? stMatch[stMatch.length - 1] : null;
      const stName  = lastSt ? lastSt.replace('/st:', '') : undefined;

      // inline: se contém "/st:inline" e antes há "/el:<NAME>"
      const inline = /\/st:inline/.test(contextId);
      const elMatch = inline ? contextId.match(/\/el:([A-Za-z_][\w.-]*)/) : null;
      const elName  = elMatch ? elMatch[0].replace('/el:', '') : undefined;

      let removed = false;

      if (stName) {
        removed = this.removeEnumUnderGlobalSimpleType(tiposDoc, stName, value);
        if (removed) {
          changes++;
          report.push(`Removido enum "${value}" de simpleType global ${stName} (tipos.xsd).`);
          continue;
        }
      }
      if (!removed && inline && elName) {
        removed = this.removeEnumUnderInlineSimpleType(eventoDoc, elName, value);
        if (removed) {
          changes++;
          report.push(`Removido enum "${value}" de simpleType inline do elemento ${elName} (evento.xsd).`);
          continue;
        }
      }

      // fallback: tente em qualquer lugar (global ou inline) — primeiro bateu, removeu
      if (!removed) {
        removed = this.removeEnumByValueAnywhere(tiposDoc, value) ||
                  this.removeEnumByValueAnywhere(eventoDoc, value);
        if (removed) {
          changes++;
          report.push(`Removido enum "${value}" por busca ampla (tipos/evento).`);
        } else {
          report.push(`⚠️ Não encontrado enum "${value}" para contexto: ${contextId}`);
        }
      }
    }

    return {
      eventoXml: serialize(eventoDoc),
      tiposXml : serialize(tiposDoc),
      changes,
      report
    };
  }

  /** Remove <xs:enumeration value="…"> de um <xs:simpleType name="stName"> (doc de tipos). */
  private removeEnumUnderGlobalSimpleType(doc: Document, stName: string, value: string): boolean {
    const st = Array.from(doc.getElementsByTagNameNS(this.XS, 'simpleType'))
      .find(el => el.getAttribute('name') === stName);
    if (!st) return false;

    const restr = this.firstChildNS(st, 'restriction');
    if (!restr) return false;

    const target = Array.from(restr.getElementsByTagNameNS(this.XS, 'enumeration'))
      .find(e => e.getAttribute('value') === value);
    if (!target || !target.parentNode) return false;

    target.parentNode.removeChild(target);
    return true;
  }

  /** Remove enum value em simpleType inline dentro de <xs:element name="elName"> */
  private removeEnumUnderInlineSimpleType(doc: Document, elName: string, value: string): boolean {
    const el = Array.from(doc.getElementsByTagNameNS(this.XS, 'element'))
      .find(e => e.getAttribute('name') === elName);
    if (!el) return false;

    // busca simpleType abaixo do element
    const st = this.firstChildNS(el, 'simpleType') || el.querySelector('xs\\:simpleType');
    if (!st) return false;

    const restr = this.firstChildNS(st as Element, 'restriction');
    if (!restr) return false;

    const target = Array.from(restr.getElementsByTagNameNS(this.XS, 'enumeration'))
      .find(e => e.getAttribute('value') === value);
    if (!target || !target.parentNode) return false;

    target.parentNode.removeChild(target);
    return true;
  }

  /** Busca ampla: remove a primeira ocorrência do enum value sob qualquer restriction. */
  private removeEnumByValueAnywhere(doc: Document, value: string): boolean {
    const enums = Array.from(doc.getElementsByTagNameNS(this.XS, 'enumeration'));
    const target = enums.find(e => e.getAttribute('value') === value);
    if (!target || !target.parentNode) return false;
    target.parentNode.removeChild(target);
    return true;
  }

  private firstChildNS(el: Element, local: string): Element | null {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI === this.XS && c.localName === local) return c as Element;
    }
    return null;
  }

  applyOccursEdits(eventoXml: string, tiposXml: string, occurs: Array<[string,{min:number;max:number|'unbounded'}]>) {
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
    const XS = 'http://www.w3.org/2001/XMLSchema';

    const eventoDoc = parse(eventoXml);
    const tiposDoc  = parse(tiposXml);
    const report: string[] = [];
    let changes = 0;

    const setOccursOnElement = (doc: Document, name: string, min: number, max: number|'unbounded'): boolean => {
      const el = Array.from(doc.getElementsByTagNameNS(XS, 'element')).find(e => e.getAttribute('name') === name);
      if (!el) return false;
      if (min === 1) el.removeAttribute('minOccurs'); else el.setAttribute('minOccurs', String(min));
      if (max === 1) el.removeAttribute('maxOccurs'); else el.setAttribute('maxOccurs', max === 'unbounded' ? 'unbounded' : String(max));
      return true;
    };

    for (const [contextId, {min, max}] of occurs) {
      // pegue o último /el:<Name> do id
      const m = contextId.match(/\/el:([A-Za-z_][\w.-]*)/g);
      const last = m ? m[m.length - 1] : null;
      const elName = last ? last.replace('/el:', '') : undefined;
      if (!elName) { report.push(`⚠️ Sem el:<name> no contexto ${contextId}`); continue; }

      // tente no evento primeiro
      let ok = setOccursOnElement(eventoDoc, elName, min, max);
      if (!ok) ok = setOccursOnElement(tiposDoc, elName, min, max); // fallback

      if (ok) { changes++; report.push(`Ocorrência de <${elName}> → ${min}..${max === 'unbounded' ? '∞' : max}.`); }
      else    { report.push(`⚠️ <${elName}> não encontrado p/ aplicar ocorrência.`); }
    }

    return { eventoXml: serialize(eventoDoc), tiposXml: serialize(tiposDoc), changes, report };
  }

  applyStringFacets(eventoXml: string, tiposXml: string,
    edits: Array<[string,{ length?: number; minLength?: number; maxLength?: number; patterns?: string[] }]>) {

    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
    const XS = 'http://www.w3.org/2001/XMLSchema';

    const eventoDoc = parse(eventoXml);
    const tiposDoc  = parse(tiposXml);

    const getOrMake = (parent: Element, local: string) => {
      let el = Array.from(parent.getElementsByTagNameNS(XS, local)).find(e => e.parentNode === parent) as Element | undefined;
      if (!el) { el = parent.ownerDocument!.createElementNS(XS, `xs:${local}`); parent.appendChild(el); }
      return el!;
    };

    const setFacet = (restr: Element, local: 'length'|'minLength'|'maxLength'|'pattern', value?: string|number) => {
      // remove todos existentes desse tipo e cria 1 novo se value definido (MVP)
      Array.from(restr.getElementsByTagNameNS(XS, local)).forEach(n => { if (n.parentNode === restr) n.parentNode!.removeChild(n); });
      if (value === undefined || value === null || value === '') return;
      const el = restr.ownerDocument!.createElementNS(XS, `xs:${local}`);
      el.setAttribute('value', String(value));
      restr.appendChild(el);
    };

    const findSimpleTypeRestriction = (doc: Document, ctxId: string): Element | null => {
      // heurística: se tiver st:<Name> → busca global; se tiver st:inline → pega inline sob último el:<Name>
      const stMatch = ctxId.match(/\/st:([A-Za-z_][\w.-]*)/g);
      const stName  = stMatch ? stMatch[stMatch.length-1].replace('/st:','') : undefined;
      if (stName) {
        const st = Array.from(doc.getElementsByTagNameNS(XS,'simpleType')).find(e=>e.getAttribute('name')===stName);
        const r  = st && Array.from(st.children).find(c=>c.namespaceURI===XS && c.localName==='restriction');
        return (r as Element) || null;
      }
      if (/\/st:inline/.test(ctxId)) {
        const elMatch = ctxId.match(/\/el:([A-Za-z_][\w.-]*)/g);
        const elName  = elMatch ? elMatch[elMatch.length-1].replace('/el:','') : undefined;
        if (elName) {
          const el = Array.from(doc.getElementsByTagNameNS(XS,'element')).find(e=>e.getAttribute('name')===elName);
          const st = el && Array.from(el.children).find(c=>c.namespaceURI===XS && c.localName==='simpleType');
          const r  = st && Array.from((st as Element).children).find(c=>c.namespaceURI===XS && c.localName==='restriction');
          return (r as Element) || null;
        }
      }
      return null;
    };

    let changes = 0; const report: string[] = [];

    for (const [ctxId, f] of edits) {
      // tente primeiro no tipos, depois no evento
      let restr = findSimpleTypeRestriction(tiposDoc, ctxId) || findSimpleTypeRestriction(eventoDoc, ctxId);
      if (!restr) { report.push(`⚠️ Restriction não encontrada para ${ctxId}`); continue; }

      // regras “apertar rédeas”
      const current = collectStringFacets(restr);
      if (f.minLength !== undefined && current.minLength !== undefined && f.minLength < current.minLength) f.minLength = current.minLength;
      if (f.maxLength !== undefined && current.maxLength !== undefined && f.maxLength > current.maxLength) f.maxLength = current.maxLength;
      if (f.length !== undefined) {
        if (current.length !== undefined && f.length < current.length) f.length = current.length;
        // ajustar coerência
        f.minLength = Math.max(f.minLength ?? 0, f.length);
        f.maxLength = Math.min(f.maxLength ?? f.length, f.length);
      }

      // aplica
      setFacet(restr, 'length',    f.length);
      if (f.length === undefined) {
        setFacet(restr, 'minLength', f.minLength);
        setFacet(restr, 'maxLength', f.maxLength);
      } else {
        // length definido ⇒ remove min/max redundantes
        setFacet(restr, 'minLength', undefined);
        setFacet(restr, 'maxLength', undefined);
      }
      if (f.patterns && f.patterns[0]) setFacet(restr, 'pattern', f.patterns[0]);

      changes++;
      const to = f.length ?? `${f.minLength ?? '∅'}..${f.maxLength ?? '∞'}`;
      report.push(`Facets de string atualizados (${ctxId}) → ${to}${f.patterns?.[0] ? `, pattern: ${f.patterns[0]}` : ''}`);
    }

    return { eventoXml: serialize(eventoDoc), tiposXml: serialize(tiposDoc), changes, report };
  }

  applyNumericFacets(
    eventoXml: string,
    tiposXml: string,
    edits: Array<[string, {
      minInclusive?: number; maxInclusive?: number;
      minExclusive?: number; maxExclusive?: number;
      totalDigits?: number; fractionDigits?: number;
      pattern?: string;
    }]>
  ) {
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
    const eventoDoc = parse(eventoXml);
    const tiposDoc  = parse(tiposXml);

    const setFacet = (restr: Element, local: string, value?: number | string) => {
      // remove existentes (mesmo facet) diretamente sob restriction
      Array.from(restr.getElementsByTagNameNS(XS, local))
        .filter(n => n.parentNode === restr)
        .forEach(n => n.parentNode!.removeChild(n));
      if (value === undefined || value === null || value === '') return;
      const el = restr.ownerDocument!.createElementNS(XS, `xs:${local}`);
      el.setAttribute('value', String(value));
      restr.appendChild(el);
    };

    let changes = 0;
    const report: string[] = [];

    for (const [ctxId, f] of edits) {
      let restr = findSimpleTypeRestriction(tiposDoc, ctxId) || findSimpleTypeRestriction(eventoDoc, ctxId);
      if (!restr) { report.push(`⚠️ Restriction não encontrada para ${ctxId}`); continue; }

      // conflitos: inclusive vs exclusive → manter apenas o que veio na edição
      if (f.minInclusive !== undefined) delete f.minExclusive;
      if (f.maxInclusive !== undefined) delete f.maxExclusive;
      if (f.minExclusive !== undefined) delete f.minInclusive;
      if (f.maxExclusive !== undefined) delete f.maxInclusive;

      setFacet(restr, 'minInclusive', f.minInclusive);
      setFacet(restr, 'maxInclusive', f.maxInclusive);
      setFacet(restr, 'minExclusive', f.minExclusive);
      setFacet(restr, 'maxExclusive', f.maxExclusive);
      setFacet(restr, 'totalDigits',  f.totalDigits);
      setFacet(restr, 'fractionDigits', f.fractionDigits);
      setFacet(restr, 'pattern', f.pattern);

      changes++;
      const min = f.minInclusive ?? (f.minExclusive !== undefined ? `>${f.minExclusive}` : '∅');
      const max = f.maxInclusive ?? (f.maxExclusive !== undefined ? `<${f.maxExclusive}` : '∅');
      report.push(`Facets numéricos (${ctxId}) → min:${min} max:${max}`
        + (f.totalDigits ? `, totalDigits:${f.totalDigits}` : '')
        + (f.fractionDigits !== undefined ? `, fractionDigits:${f.fractionDigits}` : '')
        + (f.pattern ? `, pattern` : ''));
    }

    return { eventoXml: serialize(eventoDoc), tiposXml: serialize(tiposDoc), changes, report };
  }

  applyDateFacets(
    eventoXml: string,
    tiposXml: string,
    edits: Array<[string, {
      minInclusive?: string; maxInclusive?: string;
      minExclusive?: string; maxExclusive?: string;
      pattern?: string;
    }]>
  ){
    const parse = (x:string)=> new DOMParser().parseFromString(x,'application/xml');
    const ser   = (d:Document)=> new XMLSerializer().serializeToString(d);
    const ev = parse(eventoXml);
    const tp = parse(tiposXml);

    const setFacet = (restr: Element, local: string, value?: string) => {
      Array.from(restr.getElementsByTagNameNS(XS, local))
        .filter(n => n.parentNode === restr)
        .forEach(n => n.parentNode!.removeChild(n));
      if (value==null || value==='') return;
      const el = restr.ownerDocument!.createElementNS(XS, `xs:${local}`);
      el.setAttribute('value', value);
      restr.appendChild(el);
    };

    let changes = 0;
    const report: string[] = [];

    for (const [ctxId, f] of edits) {
      let restr = findSimpleTypeRestriction(tp, ctxId) || findSimpleTypeRestriction(ev, ctxId);
      if (!restr) { report.push(`⚠️ Restriction não encontrada para ${ctxId}`); continue; }

      // conflitos
      if (f.minInclusive!==undefined) delete f.minExclusive;
      if (f.maxInclusive!==undefined) delete f.maxExclusive;
      if (f.minExclusive!==undefined) delete f.minInclusive;
      if (f.maxExclusive!==undefined) delete f.maxInclusive;

      setFacet(restr, 'minInclusive', f.minInclusive);
      setFacet(restr, 'maxInclusive', f.maxInclusive);
      setFacet(restr, 'minExclusive', f.minExclusive);
      setFacet(restr, 'maxExclusive', f.maxExclusive);
      setFacet(restr, 'pattern',      f.pattern);

      changes++;
      report.push(`Datas (${ctxId}) → min:${f.minInclusive ?? (f.minExclusive ? '>'+f.minExclusive : '∅')} max:${f.maxInclusive ?? (f.maxExclusive ? '<'+f.maxExclusive : '∅')}${f.pattern? ', pattern':''}`);
    }

    return { eventoXml: ser(ev), tiposXml: ser(tp), changes, report };
  }
}

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
