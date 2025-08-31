import { Component, computed, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewNode } from '../../../shared/models/schema-models';
import { DynamicFormStateService } from '../../../services/dynamic-form-state.service';

@Component({
  selector: 'app-xs-tree-node',
  imports: [CommonModule],
  templateUrl: './xs-tree-node.component.html',
  styleUrl: './xs-tree-node.component.css'
})
export class XsTreeNodeComponent {
  @Input({ required: true }) node!: ViewNode;

  private form = inject(DynamicFormStateService);

  // ----------------------------------------------------
  // Utils básicos
  // ----------------------------------------------------
  lc = (s?: string) => (s || '').toLowerCase();

  private childrenOfKind(n: ViewNode, kind: string) {
    return (n.children || []).filter(c => this.lc(c.kind) === this.lc(kind));
  }
  private firstChildOfKind(n: ViewNode, kind: string) {
    return (n.children || []).find(c => this.lc(c.kind) === this.lc(kind));
  }

  /** wrappers estruturais/facets que não viram caixa */
  isWrapper(n: ViewNode = this.node): boolean {
    const k = this.lc(n.kind);
    const name = n.name || '';
    const wrapperKinds = [
      'schema','complextype','sequence','simpletype','restriction','all','group',
      // facets
      'pattern','length','minlength','maxlength',
      'mininclusive','maxinclusive','minexclusive','maxexclusive',
      'totaldigits','fractiondigits'
    ];
    if (wrapperKinds.includes(k)) return true;
    if (/^(TS_|T_)/i.test(name)) return true; // tipos auxiliares
    return false;
  }

  /** percorre a cadeia (self → simpleType → restriction → …) até o fim */
  private chain(n: ViewNode = this.node, maxDepth = 8): ViewNode[] {
    const path: ViewNode[] = [];
    let cur: ViewNode | undefined = n;
    let depth = 0;
    while (cur && depth++ < maxDepth) {
      path.push(cur);
      const st = this.firstChildOfKind(cur, 'simpletype');
      if (st) { cur = st; continue; }
      const r = this.firstChildOfKind(cur, 'restriction');
      if (r) { cur = r; continue; }
      break;
    }
    return path;
  }

  /** tipo/base efetivo ao final da cadeia */
  private effectiveBase(): string {
    let base = '';
    for (const nn of this.chain()) {
      const m = nn.meta || {};
      if (m.base) base = String(m.base);
      else if (m.typeName) base = String(m.typeName);
    }
    return this.lc(base);
  }

  /** facets de string efetivas + patterns coletados em toda a cadeia */
  private effectiveStringFacets() {
    let length: number | undefined;
    let minLength: number | undefined;
    let maxLength: number | undefined;
    const patterns: string[] = [];

    const push = (p?: string) => {
      if (!p) return;
      const clean = p.replace(/^\^/, '').replace(/\$$/, '').trim();
      if (clean && !patterns.includes(clean)) patterns.push(clean);
    };

    for (const nn of this.chain()) {
      const sf = nn.meta?.stringFacets;
      if (sf) {
        if (sf.length != null)     length    = sf.length;
        if (sf.minLength != null)  minLength = sf.minLength;
        if (sf.maxLength != null)  maxLength = sf.maxLength;
        (sf.patterns || []).forEach(push);
      }
      // patterns como nós
      this.childrenOfKind(nn, 'pattern').forEach(p => push(p.name));
    }

    return { length, minLength, maxLength, patterns };
  }

  /** facets numéricas efetivas (coletadas na cadeia) */
  private effectiveNumericFacets() {
    let f = {
      minInclusive: undefined as number|undefined,
      maxInclusive: undefined as number|undefined,
      minExclusive: undefined as number|undefined,
      maxExclusive: undefined as number|undefined,
      totalDigits:  undefined as number|undefined,
      fractionDigits: undefined as number|undefined,
    };
    for (const nn of this.chain()) {
      const nf = nn.meta?.numericFacets;
      if (!nf) continue;
      if (nf.minInclusive  != null) f.minInclusive  = nf.minInclusive;
      if (nf.maxInclusive  != null) f.maxInclusive  = nf.maxInclusive;
      if (nf.minExclusive  != null) f.minExclusive  = nf.minExclusive;
      if (nf.maxExclusive  != null) f.maxExclusive  = nf.maxExclusive;
      if (nf.totalDigits   != null) f.totalDigits   = nf.totalDigits;
      if (nf.fractionDigits!= null) f.fractionDigits= nf.fractionDigits;
    }
    return f;
  }

  /** obrigatório se use='required' OU occurs.min > 0 */
  private isRequiredNode(n: ViewNode = this.node): boolean {
    const use = (n.meta?.use || '').toString().toLowerCase();
    const minOccurs = n.meta?.occurs?.min;
    return use === 'required' || (typeof minOccurs === 'number' && minOccurs > 0);
  }

  //-----------------------------------------------------
  // OCCURS
  //-----------------------------------------------------

  // Isolar valores por instância (já existente no seu código)
  @Input() idPrefix: string = '';

  // Para impedir recursão quando renderizarmos a MESMA árvore por instância
  @Input() disableRepeat = false;

  // Chave com prefixo (não mude se já tiver igual)
  private keyFor(id: string) { return (this.idPrefix ? this.idPrefix : '') + id; }
  private getVal(id: string): string { return (this as any).store?.[this.keyFor(id)] ?? ''; }
  private setVal(id: string, v: string) { ((this as any).store ||= {})[this.keyFor(id)] = v ?? ''; }

  // ------------------ occurs ------------------
  private occ = new Map<string, number>();

  private occursMeta(n: ViewNode) {
    // fallback seguro
    return n.meta?.occurs ?? { min: 0, max: 1 as number | 'unbounded' };
  }
  private initOcc(n: ViewNode) {
    if (!this.occ.has(n.id)) {
      const { min } = this.occursMeta(n);
      this.occ.set(n.id, Math.max(0, Number(min || 0)));
    }
  }
  occCount(n: ViewNode): number { this.initOcc(n); return this.occ.get(n.id)!; }
  occIndexes(n: ViewNode): number[] { return Array.from({ length: this.occCount(n) }, (_, i) => i); }

  canAdd(n: ViewNode): boolean {
    const { max } = this.occursMeta(n);
    const cur = this.occCount(n);
    return max === 'unbounded' || cur < (max ?? 1);
  }
  canRemove(n: ViewNode): boolean {
    const { min } = this.occursMeta(n);
    const cur = this.occCount(n);
    return cur > (min ?? 0);
  }
  incOcc(n: ViewNode) { if (this.canAdd(n)) this.occ.set(n.id, this.occCount(n) + 1); }
  decOcc(n: ViewNode) { if (this.canRemove(n)) this.occ.set(n.id, this.occCount(n) - 1); }

  // ------------------ repeatable? ------------------
  /** “Repetível” = max>1 ou unbounded (e não estiver bloqueado por disableRepeat) */
  isRepeatable(): boolean {
    if (this.disableRepeat) return false;
    const oc = this.node.meta?.occurs;
    if (!oc) return false;
    if (oc.max === 'unbounded') return true;
    return typeof oc.max === 'number' && oc.max > 1;
  }

  // ----------------------------------------------------
  // CHOICE
  // ----------------------------------------------------
  isChoice(): boolean { return this.lc(this.node.kind) === 'choice'; }
  selectedChoiceId = computed(() => this.form.getChoice(this.node.id) ?? '');
  onChoose(childId: string) { this.form.setChoice(this.node.id, childId); }
  selectedChild = computed<ViewNode | null>(() => {
    const id = this.selectedChoiceId();
    if (!id) {
      if (this.isChoice() && this.node.children?.length === 1) {
        const only = this.node.children[0];
        this.form.setChoice(this.node.id, only.id);
        return only;
      }
      return null;
    }
    return (this.node.children || []).find(c => c.id === id) || null;
  });

  // ----------------------------------------------------
  // ENUM (busca profunda) – prioridade sobre string/number
  // ----------------------------------------------------
  private collectEnumOptionsDeep(n: ViewNode, depth = 0): ViewNode[] {
    if (depth > 3) return [];
    const out: ViewNode[] = [];

    // a) enumeration direto
    for (const en of this.childrenOfKind(n, 'enumeration')) {
      out.push(...(en.children?.length ? en.children : [en]));
    }
    // b) restriction → enumeration
    const restr = this.firstChildOfKind(n, 'restriction');
    if (restr) {
      for (const en of this.childrenOfKind(restr, 'enumeration')) {
        out.push(...(en.children?.length ? en.children : [en]));
      }
    }
    // c) simpleType → …
    const st = this.firstChildOfKind(n, 'simpletype');
    if (st) out.push(...this.collectEnumOptionsDeep(st, depth + 1));

    // d) netos que contenham enumeration
    for (const ch of n.children || []) {
      if (this.lc(ch.kind) !== 'enumeration' && ch.children?.length) {
        for (const en of this.childrenOfKind(ch, 'enumeration')) {
          out.push(...(en.children?.length ? en.children : [en]));
        }
      }
    }

    // e) fallback: enums em meta
    const enums = n.meta?.numericFacets?.enums;
    if (enums?.length) {
      for (const v of enums) {
        out.push({
          id: `${n.id}#enum:${v}`,
          name: String(v),
          kind: 'enumeration',
          children: [],
          source: n.source,
          meta: { docs: [] }
        });
      }
    }

    // dedupe por nome
    const seen: Record<string, true> = {};
    return out.filter(opt => {
      const key = opt.name ?? '';
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  enumOptions = computed(() => this.collectEnumOptionsDeep(this.node));
  isEnumList(): boolean { return this.enumOptions().length > 0; }

  selectedEnum = computed(() => this.form.getEnum(this.node.id) ?? '');
  onChooseEnum(val: string) { this.form.setEnum(this.node.id, val); }
  enumLabel(opt: ViewNode): string {
    const val = opt.name || '';
    const doc = (opt.meta?.docs && opt.meta.docs[0]) ? String(opt.meta.docs[0]).trim() : '';
    return doc ? `${val} - ${doc}` : val;
  }

  // ----------------------------------------------------
  // STRING (tipo efetivo xs:string; patterns/facets da cadeia)
  // ----------------------------------------------------
  isStringInput(): boolean {
    if (this.isEnumList() || this.isNumericInput()) return false; // prioridades
    const base = this.effectiveBase(); // resolve até o fim
    const k = this.lc(this.node.kind);
    return (k === 'element' || k === 'simpletype') && base.includes('string');
  }

  textValue = computed(() => this.form.getText(this.node.id));
  onText(v: string) { this.form.setText(this.node.id, v); }

  exactLen(): number | undefined { return this.effectiveStringFacets().length; }
  minLen(): number | undefined { return this.effectiveStringFacets().minLength; }
  maxLen(): number | undefined { return this.effectiveStringFacets().maxLength; }


  private collectAllPatternsDeep(n: ViewNode = this.node): string[] {
    const patterns: string[] = [];
    const push = (p?: string) => {
      const norm = this.normalizePattern(p);
      if (norm && !patterns.includes(norm)) patterns.push(norm);
    };

    for (const nn of this.chain(n)) {
      nn.meta?.stringFacets?.patterns?.forEach(push);
      this.childrenOfKind(nn, 'pattern').forEach(p => push(p.name));
    }
    return patterns;
  }
  patterns(): string[] { return this.collectAllPatternsDeep(); }

  htmlPattern(): string | null {
    const pats = this.patterns();
    if (!pats.length) return null;
    return pats.length === 1 ? pats[0] : `(?:${pats.join(')|(?:')})`;
  }

private compileAnchoredRegex(raw: string): RegExp | null {
  const norm = this.normalizePattern(raw);
  if (!norm) return null;
  try { return new RegExp(`^(?:${norm})$`); } catch { return null; }
}


textError = computed(() => {
  const v = (this.textValue() ?? '').trim();
  if (v === '') return 'Obrigatório';

  // 1) pattern primeiro
  for (const raw of this.patterns()) {
    const re = this.compileAnchoredRegex(raw);
    if (re && !re.test(v)) return `Valor não atende ao padrão: ${raw}`;
  }

  // 2) demais facets
  const len = v.length;
  const ex = this.exactLen(); if (ex != null && len !== ex) return `Deve ter exatamente ${ex} caracteres.`;
  const mi = this.minLen();  if (mi != null && len < mi)   return `Mínimo de ${mi} caracteres.`;
  const ma = this.maxLen();  if (ma != null && len > ma)   return `Máximo de ${ma} caracteres.`;
  return '';
});

hint(): string {
  const bits: string[] = [];
  const pats = this.patterns(); if (pats.length) bits.push(`pattern: ${pats[0]}`);
  const ex = this.exactLen(); const mi = this.minLen(); const ma = this.maxLen();
  if (ex != null) bits.push(`tamanho: ${ex}`); else { if (mi != null) bits.push(`mín: ${mi}`); if (ma != null) bits.push(`máx: ${ma}`); }
  return bits.join(' · ');
}


  // ----------------------------------------------------
  // NUMÉRICO (bases xs:int/xs:integer/...); patterns + facets
  // ----------------------------------------------------
  private numericBases = [
    'byte','short','int','integer','long','decimal','float','double',
    'nonnegativeinteger','positiveinteger','nonpositiveinteger','negativeinteger',
    'unsignedbyte','unsignedshort','unsignedint','unsignedlong'
  ];

  isNumericInput(): boolean {
    if (this.isEnumList()) return false; // enum tem prioridade
    const base = this.effectiveBase();
    const k = this.lc(this.node.kind);
    return (k === 'element' || k === 'simpletype') &&
           this.numericBases.some(b => base.endsWith(b));
  }

  numberValue = computed(() => this.form.getText(this.node.id)); // armazenamos como string
  onNumber(v: string) { this.form.setText(this.node.id, v); }

  // patterns numéricos (reuso do coletor)
  numericPatterns(): string[] { return this.collectAllPatternsDeep(); }
  numericHtmlPattern(): string | null {
    const pats = this.numericPatterns();
    if (!pats.length) return null;
    return pats.length === 1 ? pats[0] : `(?:${pats.join(')|(?:')})`;
  }

  // atributos/hints
  minAttr(): number | null {
    const f = this.effectiveNumericFacets();
    if (f.minInclusive != null) return f.minInclusive;
    if (f.minExclusive != null) return f.minExclusive + 1; // aproximação p/ inteiro
    return null;
  }
  maxAttr(): number | null {
    const f = this.effectiveNumericFacets();
    if (f.maxInclusive != null) return f.maxInclusive;
    if (f.maxExclusive != null) return f.maxExclusive - 1;
    return null;
  }
  stepAttr(): string | null {
    const f = this.effectiveNumericFacets();
    if (f.fractionDigits != null && f.fractionDigits > 0) {
      return '0.' + '0'.repeat(f.fractionDigits - 1) + '1';
    }
    return '1';
  }

numberError = computed(() => {
  const rawVal = (this.numberValue() ?? '').trim();
  if (rawVal === '') return 'Obrigatório';

  // 1) pattern primeiro
  for (const pat of this.numericPatterns()) {
    const re = this.compileAnchoredRegex(pat);
    if (re && !re.test(rawVal)) return `Valor não atende ao padrão: ${pat}`;
  }

  // 2) validade numérica
  const isNum = /^-?\d+(\.\d+)?$/.test(rawVal);
  if (!isNum) return 'Número inválido';

  const f = this.effectiveNumericFacets();
  const val = Number(rawVal);
  const base = this.effectiveBase();
  const mustBeInt = !base.includes('decimal') && !base.includes('float') && !base.includes('double');
  if (mustBeInt && !/^[-]?\d+$/.test(rawVal)) return 'Deve ser inteiro';

  if (f.fractionDigits != null) {
    const dec = (rawVal.split('.')[1] || '').length;
    if (dec > f.fractionDigits) return `Máximo de ${f.fractionDigits} casas decimais`;
  }
  if (f.totalDigits != null) {
    const digits = rawVal.replace(/^-/, '').replace('.', '');
    if (digits.length > f.totalDigits) return `Máximo de ${f.totalDigits} dígitos`;
  }
  if (f.minInclusive != null && !(val >= f.minInclusive)) return `Mínimo: ${f.minInclusive}`;
  if (f.minExclusive != null && !(val >  f.minExclusive)) return `Deve ser > ${f.minExclusive}`;
  if (f.maxInclusive != null && !(val <= f.maxInclusive)) return `Máximo: ${f.maxInclusive}`;
  if (f.maxExclusive != null && !(val <  f.maxExclusive)) return `Deve ser < ${f.maxExclusive}`;

  return '';
});

  numberHint(): string {
    const bits: string[] = [];
    const pats = this.numericPatterns(); if (pats.length) bits.push(`pattern: ${pats[0]}`);
    const f = this.effectiveNumericFacets();
    if (f.minInclusive  != null) bits.push(`mín: ${f.minInclusive}`);
    if (f.maxInclusive  != null) bits.push(`máx: ${f.maxInclusive}`);
    if (f.minExclusive  != null) bits.push(`> ${f.minExclusive}`);
    if (f.maxExclusive  != null) bits.push(`< ${f.maxExclusive}`);
    if (f.totalDigits   != null) bits.push(`dígitos: ${f.totalDigits}`);
    if (f.fractionDigits!= null) bits.push(`decimais: ${f.fractionDigits}`);
    return bits.join(' · ');
  }

  private normalizePattern(raw?: string): string | null {
    if (!raw) return null;
    let s = String(raw).trim();

    // remove rótulos comuns
    s = s.replace(/^pattern\s*:\s*/i, '').replace(/^regex\s*:\s*/i, '').trim();

    // remove aspas envolventes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }

    // tira ^ e $ externos (se existirem)
    if (s.startsWith('^')) s = s.slice(1);
    if (s.endsWith('$')) s = s.slice(0, -1);

    // \\d -> \d etc.
    s = s.replace(/\\\\/g, '\\');

    // ignora triviais
    if (!s || s === '.*' || s === '.+') return null;
    return s;
  }

  //====================================================
  // DATE TYPE
  //====================================================

  /** xs:qname -> token final: xs:date, xsd:date, {uri}date => 'date' */
  private qnToToken(s?: string): string {
    if (!s) return '';
    return String(s).toLowerCase().trim()
      .replace(/^\{[^}]+\}/, '')
      .replace(/^[a-z_][\w.-]*:/, '')
      .trim();
  }

  /** Detecta data SÓ no nó atual (não olha filhos) */
  isDateHere(): boolean {
    const k = (this.node.kind || '').toLowerCase();
    if (!(k === 'element' || k === 'simpletype')) return false;
    const tok = this.qnToToken(this.node.meta?.base) || this.qnToToken(this.node.meta?.typeName);
    return tok === 'date';
  }

  /** Reaproveita o armazenamento de texto que você já usa */
  dateValue() { return this.textValue(); }
  onDate(v: string) { this.onText(v); }

  /** Facets de data do próprio nó (sem subárvore) */
  private dateFacetsHere() {
    return this.node.meta?.dateFacets ?? {};
  }

  private addDays(iso: string, d: number): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return null;
    const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3] + d));
    const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
    const dd = String(dt.getUTCDate()).padStart(2,'0');
    return `${dt.getUTCFullYear()}-${mm}-${dd}`;
  }

  dateMinAttr(): string | null {
    const f = this.dateFacetsHere();
    return f.minInclusive ?? (f.minExclusive ? this.addDays(f.minExclusive, +1) : null);
  }
  dateMaxAttr(): string | null {
    const f = this.dateFacetsHere();
    return f.maxInclusive ?? (f.maxExclusive ? this.addDays(f.maxExclusive, -1) : null);
  }

  /** Mensagens (simples) */
  dateHint(): string {
    const f = this.dateFacetsHere();
    const bits: string[] = [];
    if (f.minInclusive) bits.push(`mín: ${f.minInclusive}`);
    if (f.minExclusive) bits.push(`> ${f.minExclusive}`);
    if (f.maxInclusive) bits.push(`máx: ${f.maxInclusive}`);
    if (f.maxExclusive) bits.push(`< ${f.maxExclusive}`);
    return bits.join(' · ');
  }

  /** Validação leve: obrigatório + AAAA-MM-DD + limites, sem interferir em mais nada */
  dateError(): string {
    const v = (this.dateValue() || '').trim();
    if (!v) return 'Obrigatório';

    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) return 'Formato inválido (AAAA-MM-DD)';
    const d = new Date(v), [Y,M,D] = v.split('-').map(Number);
    if (isNaN(+d) || d.getUTCFullYear()!==Y || d.getUTCMonth()+1!==M || d.getUTCDate()!==D) return 'Data inexistente';

    const f = this.dateFacetsHere();
    if (f.minInclusive && !(v >= f.minInclusive)) return `Mínimo: ${f.minInclusive}`;
    if (f.minExclusive && !(v >  f.minExclusive)) return `Deve ser > ${f.minExclusive}`;
    if (f.maxInclusive && !(v <= f.maxInclusive)) return `Máximo: ${f.maxInclusive}`;
    if (f.maxExclusive && !(v <  f.maxExclusive)) return `Deve ser < ${f.maxExclusive}`;
    return '';
  }
}