import { Injectable } from '@angular/core';

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
}
