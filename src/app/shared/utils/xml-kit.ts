export const XS = 'http://www.w3.org/2001/XMLSchema';

/** Encontra o <xs:restriction> de um simpleType (global "st:TS_*" ou inline "st:inline"). */
export function findSimpleTypeRestriction(doc: Document, ctxId: string): Element | null {
  // global: .../st:TS_nome
  const stMatch = ctxId.match(/\/st:([A-Za-z_][\w.-]*)/g);
  const stName  = stMatch ? stMatch[stMatch.length - 1].replace('/st:', '') : undefined;
  if (stName) {
    const st = Array.from(doc.getElementsByTagNameNS(XS, 'simpleType'))
      .find(e => e.getAttribute('name') === stName);
    if (st) {
      return Array.from(st.children)
        .find(c => c.namespaceURI === XS && c.localName === 'restriction') as Element || null;
    }
  }
  // inline: .../st:inline (último el:<Nome> acima)
  if (/\/st:inline/.test(ctxId)) {
    const elMatch = ctxId.match(/\/el:([A-Za-z_][\w.-]*)/g);
    const elName  = elMatch ? elMatch[elMatch.length - 1].replace('/el:', '') : undefined;
    if (elName) {
      const el = Array.from(doc.getElementsByTagNameNS(XS, 'element'))
        .find(e => e.getAttribute('name') === elName);
      if (el) {
        const st = Array.from(el.children)
          .find(c => c.namespaceURI === XS && c.localName === 'simpleType') as Element;
        if (st) {
          return Array.from(st.children)
            .find(c => c.namespaceURI === XS && c.localName === 'restriction') as Element || null;
        }
      }
    }
  }
  return null;
}

/** Heurística: menor/maior número do nome do tipo TS_* (ex.: TS_val_0_999 => {min:0,max:999}). */
export function inferMinMaxFromTypeName(typeName?: string | null):
  { min?: number; max?: number } | undefined {
  if (!typeName) return;
  const nums = (typeName.match(/\d+/g) || []).map(n => Number(n)).filter(n => Number.isFinite(n));
  if (!nums.length) return;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Coleta facets numéricos de um <xs:restriction> (para árvore e/ou mutations). */
export function collectNumericFacets(restr: Element) {
  const f: {
    minInclusive?: number; maxInclusive?: number;
    minExclusive?: number; maxExclusive?: number;
    totalDigits?: number; fractionDigits?: number;
    pattern?: string; enums?: string[];
  } = {};
  for (const c of Array.from(restr.children)) {
    if (c.namespaceURI !== XS) continue;
    const e = c as Element; const v = e.getAttribute('value') ?? '';
    switch (e.localName) {
      case 'minInclusive': f.minInclusive = Number(v); break;
      case 'maxInclusive': f.maxInclusive = Number(v); break;
      case 'minExclusive': f.minExclusive = Number(v); break;
      case 'maxExclusive': f.maxExclusive = Number(v); break;
      case 'totalDigits' : f.totalDigits  = Number(v); break;
      case 'fractionDigits': f.fractionDigits = Number(v); break;
      case 'pattern'     : f.pattern = v; break;
      case 'enumeration' : (f.enums ??= []).push(v); break;
    }
  }
  return f;
}

export function inferMaxFromTypeName(typeName?: string | null): number | undefined {
  if (!typeName) return undefined;
  // pega o último bloco numérico (suporta _12_34_56, -12-34, etc.)
  const m = typeName.match(/(\d+)(?!.*\d)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export function inferMinMaxFromPatterns(patterns?: string[] | string):
  { min?: number; max?: number } | undefined {

  const pats = !patterns ? [] : Array.isArray(patterns) ? patterns : [patterns];
  if (!pats.length) return;

  // extrai todos quantificadores de dígitos: \d{n}  |  \d{a,b}
  // também considera alternativas com |  (ex.: ^\d{2}|\d{3}$)
  const quantRe = /\\d\{(\d+)(?:,(\d+))?\}/g;

  let minDigits: number | undefined;
  let maxDigits: number | undefined;

  for (const p of pats) {
    let m: RegExpExecArray | null;
    while ((m = quantRe.exec(p)) !== null) {
      const a = Number(m[1]);
      const b = m[2] !== undefined ? Number(m[2]) : a;
      minDigits = minDigits === undefined ? a : Math.min(minDigits, a);
      maxDigits = maxDigits === undefined ? b : Math.max(maxDigits, b);
    }
  }

  if (minDigits === undefined && maxDigits === undefined) return;

  // Heurística conservadora:
  // - se permite pelo menos 1 dígito → mínimo 0 (aceita "0")
  // - máximo: 10^maxDigits - 1
  const min = (minDigits ?? 1) >= 1 ? 0 : 0;
  const max = maxDigits !== undefined ? Math.pow(10, maxDigits) - 1 : undefined;

  return { min, max };
}

