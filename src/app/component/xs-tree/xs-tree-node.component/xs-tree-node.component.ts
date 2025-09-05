import { Component, computed, DestroyRef, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewNode } from '../../../shared/models/schema-models';
import { DynamicFormStateService } from '../../../services/dynamic-form-state.service';
import { LiveXmlService } from '../../../services/live-xml.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-xs-tree-node',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './xs-tree-node.component.html',
  styleUrl: './xs-tree-node.component.css'
})
export class XsTreeNodeComponent implements OnInit, OnChanges {
  // -------------------- Inputs --------------------
  @Input({ required: true }) node!: ViewNode;
  @Input() vPrefix = '';
  @Input() instanceIndex?: number;
  @Input() idPrefix: string = '';      // ok manter, mas não usamos mais para chave
  @Input() disableRepeat = false;
  @Input() lite = false;
  @Output() formChange = new EventEmitter<any>()

  // -------------------- Injeções --------------------
  private form = inject(DynamicFormStateService);
  constructor(private liveXml: LiveXmlService, private destroyRef: DestroyRef) {}

  // -------------------- Lifecycle --------------------
  private liveBoundPath?: string;

  ngOnInit(): void { this.bindToLiveXmlIfReady(); }
  ngOnChanges(changes: SimpleChanges): void {
    if ('vPrefix' in changes || 'instanceIndex' in changes) this.bindToLiveXmlIfReady();
  }

  // -------------------- Helpers básicos --------------------

  private emitFormUpdate(pathVisual: string, value: string, valid: boolean): any {
    console.groupCollapsed('[field:update]');
    console.log('path  :', pathVisual);
    console.log('value :', value);
    console.log('valid :', valid);
    console.groupEnd();

    const snapshot = this.getFormSnapshot();
    this.formChange.emit(snapshot);   // se ninguém ouvir, não tem problema
    return snapshot;
  }

  /** tenta extrair o “snapshot” do serviço (pega o que existir) */
  private getFormSnapshot(): any {
    const f: any = this.form as any;
    if (typeof f.dump === 'function')     return f.dump();
    if (typeof f.snapshot === 'function') return f.snapshot();
    if (typeof f.toJSON === 'function')   return f.toJSON();
    if ('value' in f)                     return f.value;
    if (typeof f.getAll === 'function')   return f.getAll();
    // fallback: algo que não quebre
    return { warning: 'Snapshot não disponível; implemente dump()/snapshot()/toJSON()/value no DynamicFormStateService.' };
  }

  trackByIndex(i: number) { return i; }
  lc = (s?: string) => (s || '').toLowerCase();
  private elName(): string { return this.node?.name || ''; }
  label(): string { return this.node.name || this.node.kind || ''; }

  /** caminho VISUAL (inclui [n] para elementos) */
  public getVisualPath(): string {
    const isEl = (this.node?.kind || '').toLowerCase() === 'element';
    if (!isEl) return this.vPrefix || '';
    const idx = this.instanceIndex != null ? `[${this.instanceIndex + 1}]` : '';
    return (this.vPrefix ? this.vPrefix + '/' : '') + this.elName() + idx;
  }

  /** campo do formulário = caminho visual */
  private fieldKey(): string { return this.getVisualPath(); }

  /** base do grupo (sem índice no último segmento) */
  private basePathNoIndex(): string {
    const isEl = (this.node?.kind || '').toLowerCase() === 'element';
    if (!isEl) return this.vPrefix || '';
    return (this.vPrefix ? this.vPrefix + '/' : '') + (this.node.name || '');
  }

  /** chave de choice isolada por PAI (evita conflito entre instâncias) */
  private choiceKey(): string {
    return `${this.vPrefix || ''}::choice@${this.node.id}`;
  }

  // -------------------- Live XML bridge --------------------
  private readFormOnce(): string {
    const k = this.fieldKey();
    return this.isEnumList() ? (this.form.getEnum(k) ?? '') : (this.form.getText(k) ?? '');
  }
  private applyToFormFromXml(v: string): void {
    const k = this.fieldKey();
    if (this.isEnumList()) this.form.setEnum(k, v ?? '');
    else this.form.setText(k, v ?? '');
  }

  private bindToLiveXmlIfReady(): void {
    const pathV = this.getVisualPath();
    if (!pathV) return;
    if (this.liveBoundPath === pathV) return;

    this.liveBoundPath = pathV;

    // cria o elemento se for obrigatório
    const isElement = (this.node?.kind || '').toLowerCase() === 'element';
    const occMin = this.node.meta?.occurs?.min ?? 0;
    if (isElement && occMin > 0) this.liveXml.ensurePath(pathV);

    // registra ordem de filhos (ajuda criação nesse pai)
    if (this.node?.children?.length) {
      const order = this.node.children
        .filter(c => (c.kind || '').toLowerCase() === 'element')
        .map(c => c.name!)
        .filter(Boolean);
      if (order.length) this.liveXml.registerOrder(pathV, order);
    }

    // XML -> Form
    this.liveXml.observe(pathV)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(val => {
        if (val !== this.readFormOnce()) this.applyToFormFromXml(val);
      });

    // Semear XML com valor já no Form
    const current = this.readFormOnce();
    if ((current ?? '').trim() !== '') this.liveXml.setValue(pathV, current);
  }

  // -------------------- Estrutura / tipos --------------------
  private childrenOfKind(n: ViewNode, kind: string) {
    return (n.children || []).filter(c => this.lc(c.kind) === this.lc(kind));
  }
  private firstChildOfKind(n: ViewNode, kind: string) {
    return (n.children || []).find(c => this.lc(c.kind) === this.lc(kind));
  }

  isWrapper(n: ViewNode = this.node): boolean {
    const k = this.lc(n.kind);
    const name = n.name || '';
    const wrapperKinds = [
      'schema','complextype','sequence','simpletype','restriction','all','group',
      'pattern','length','minlength','maxlength','mininclusive','maxinclusive',
      'minexclusive','maxexclusive','totaldigits','fractiondigits'
    ];
    if (wrapperKinds.includes(k)) return true;
    if (/^(TS_|T_)/i.test(name)) return true;
    return false;
  }

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

  private effectiveBase(): string {
    let base = '';
    for (const nn of this.chain()) {
      const m = nn.meta || {};
      if (m.base) base = String(m.base);
      else if (m.typeName) base = String(m.typeName);
    }
    return this.lc(base);
  }

  private isRequiredNode(n: ViewNode = this.node): boolean {
    const use = (n.meta?.use || '').toString().toLowerCase();
    const minOccurs = n.meta?.occurs?.min;
    return use === 'required' || (typeof minOccurs === 'number' && minOccurs > 0);
  }
  private isRequiredElement(): boolean {
    return (this.node.meta?.occurs?.min ?? 0) >= 1;
  }

  // -------------------- Grupos (occurs) via serviço --------------------
  occCount(_: ViewNode): number {
    return this.form.getGroupCount(this.basePathNoIndex());
  }
  occIndexes(n: ViewNode): number[] {
    const cnt = this.occCount(n);
    return Array.from({ length: cnt }, (_, i) => i);
  }
  canAdd(n: ViewNode): boolean {
    const { max } = n.meta?.occurs ?? { max: 1 as number | 'unbounded' };
    const cur = this.occCount(n);
    return max === 'unbounded' || cur < (max ?? 1);
  }
  canRemove(n: ViewNode): boolean {
    const { min } = n.meta?.occurs ?? { min: 0 };
    const cur = this.occCount(n);
    return cur > (min ?? 0);
  }
  incOcc(n: ViewNode) {
    const base = this.basePathNoIndex();
    const cur = this.form.getGroupCount(base);
    this.form.setGroupCount(base, cur + 1);

    this.liveXml.setGroupCount(base, cur + 1);

    this.emitFormUpdate(this.getVisualPath(), '', true);
  }
  decOcc(n: ViewNode) {
    const base = this.basePathNoIndex();
    const cur = this.form.getGroupCount(base);
    if (cur <= 0) return;

    this.form.clearByPrefix(`${base}[${cur}]`);
    this.form.setGroupCount(base, cur - 1);

    this.liveXml.setGroupCount(base, cur - 1);

    this.emitFormUpdate(this.getVisualPath(), '', true);
  }
  setOccTo(target: number): void {
    target = Math.max(0, target|0);
    this.form.setGroupCount(this.basePathNoIndex(), target);
  }
  isRepeatable(): boolean {
    if (this.disableRepeat) return false;
    const oc = this.node.meta?.occurs;
    if (!oc) return false;
    if (oc.max === 'unbounded') return true;
    return typeof oc.max === 'number' && oc.max > 1;
  }

  // -------------------- Choice --------------------
  isChoice(): boolean { return this.lc(this.node.kind) === 'choice'; }

  private parentBasePath(): string { return this.vPrefix || ''; }

  private optionElementNames(): string[] {
    // choice pode ter wrappers; se precisar, troque por “firstElementNameDeep”
    return (this.node.children || [])
      .map(c => c.name)
      .filter((n): n is string => !!n);
  }

  private chosenElementName(childId: string): string {
    return (this.node.children || []).find(c => c.id === childId)?.name ?? '';
  }


  selectedChoiceId = computed(() => this.form.getChoice(this.choiceKey()) ?? '');
  onChoose(childId: string) {
    const base = this.vPrefix || '';                                        // PAI absoluto
    const names = (this.node.children || []).map(c => c.name!).filter(Boolean);
    const chosenName = (this.node.children || []).find(c => c.id === childId)?.name ?? '';

    this.form.setChoice(
      `${this.vPrefix}::choice@${this.node.id}`,
      childId,
      { basePath: base, optionElementNames: names, chosenElementName: chosenName }
    );

    this.liveXml.setChoice(base, names, chosenName || null);

    this.emitFormUpdate(this.getVisualPath() + ' [choice]', childId, !!childId);

    console.groupCollapsed('[field:update]');
    console.log('path  :', this.getVisualPath() + ' [choice]');
    console.log('value :', childId);
    console.log('valid :', !!childId);
    console.groupEnd();
  }

  selectedChild = computed<ViewNode | null>(() => {
    const id = this.selectedChoiceId();
    if (!id) {
      if (this.isChoice() && this.node.children?.length === 1) {
        const only = this.node.children[0];
        this.form.setChoice(this.choiceKey(), only.id, {
          basePath: this.vPrefix || '',
          optionElementNames: this.node.children?.filter(c => !!c.name).map(c => c.name!) ?? [],
          chosenElementName: only.name ?? ''
        });
        return only;
      }
      return null;
    }
    return (this.node.children || []).find(c => c.id === id) || null;
  });

  // -------------------- Enum --------------------
  private collectEnumOptionsDeep(n: ViewNode, depth = 0): ViewNode[] {
    if (depth > 3) return [];
    const out: ViewNode[] = [];

    for (const en of this.childrenOfKind(n, 'enumeration')) {
      out.push(...(en.children?.length ? en.children : [en]));
    }
    const restr = this.firstChildOfKind(n, 'restriction');
    if (restr) {
      for (const en of this.childrenOfKind(restr, 'enumeration')) {
        out.push(...(en.children?.length ? en.children : [en]));
      }
    }
    const st = this.firstChildOfKind(n, 'simpletype');
    if (st) out.push(...this.collectEnumOptionsDeep(st, depth + 1));

    for (const ch of n.children || []) {
      if (this.lc(ch.kind) !== 'enumeration' && ch.children?.length) {
        for (const en of this.childrenOfKind(ch, 'enumeration')) {
          out.push(...(en.children?.length ? en.children : [en]));
        }
      }
    }

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

  selectedEnum = computed(() => this.form.getEnum(this.fieldKey()) ?? '');

  onChooseEnum(val: string) {
    const value = (val ?? '').trim();
    this.form.setEnum(this.fieldKey(), value);
    const required = this.isRequiredNode();
    const allowed = this.enumOptions().map(o => o.name);
    const valid = (value !== '' || !required) && (value === '' || allowed.includes(value));

    const pathV = this.getVisualPath();
    this.liveXml.setValue(pathV, value);

    console.groupCollapsed('[field:update]');
    console.log('path  :', pathV);
    console.log('value :', value);
    console.log('valid :', valid);
    console.groupEnd();
  }

  enumLabel(opt: ViewNode): string {
    const val = opt.name || '';
    const doc = (opt.meta?.docs && opt.meta.docs[0]) ? String(opt.meta.docs[0]).trim() : '';
    return doc ? `${val} - ${doc}` : val;
  }

  // -------------------- String --------------------
  isStringInput(): boolean {
    if (this.isEnumList() || this.isNumericInput()) return false;
    const base = this.effectiveBase();
    const k = this.lc(this.node.kind);
    return (k === 'element' || k === 'simpletype') && base.includes('string');
  }

  textValue = computed(() => this.form.getText(this.fieldKey()));
  onText(v: string) {
    const value = (v ?? '').trim();
    this.form.setText(this.fieldKey(), value);
    const valid = this.textError() === '';
    const pathV = this.getVisualPath();
    this.liveXml.setValue(pathV, value);

    console.groupCollapsed('[field:update]');
    console.log('path  :', pathV);
    console.log('value :', value);
    console.log('valid :', valid);
    console.groupEnd();
  }

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
      this.childrenOfKind(nn, 'pattern').forEach(p => push(p.name));
    }
    return { length, minLength, maxLength, patterns };
  }

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

  private normalizePattern(raw?: string): string | null {
    if (!raw) return null;
    let s = String(raw).trim();
    s = s.replace(/^pattern\s*:\s*/i, '').replace(/^regex\s*:\s*/i, '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
    if (s.startsWith('^')) s = s.slice(1);
    if (s.endsWith('$')) s = s.slice(0, -1);
    s = s.replace(/\\\\/g, '\\');
    if (!s || s === '.*' || s === '.+') return null;
    return s;
  }

  private compileAnchoredRegex(raw: string): RegExp | null {
    const norm = this.normalizePattern(raw);
    if (!norm) return null;
    try { return new RegExp(`^(?:${norm})$`); } catch { return null; }
  }

  textError = computed(() => {
    const v = (this.textValue() ?? '').trim();
    if (v === '') return 'Obrigatório';
    for (const raw of this.patterns()) {
      const re = this.compileAnchoredRegex(raw);
      if (re && !re.test(v)) return `Valor não atende ao padrão: ${raw}`;
    }
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

  // -------------------- Numérico --------------------
  private numericBases = [
    'byte','short','int','integer','long','decimal','float','double',
    'nonnegativeinteger','positiveinteger','nonpositiveinteger','negativeinteger',
    'unsignedbyte','unsignedshort','unsignedint','unsignedlong'
  ];

  isNumericInput(): boolean {
    if (this.isEnumList()) return false;
    const base = this.effectiveBase();
    const k = this.lc(this.node.kind);
    return (k === 'element' || k === 'simpletype') &&
           this.numericBases.some(b => base.endsWith(b));
  }

  numberValue = computed(() => this.form.getText(this.fieldKey()));

  onNumber(v: string) {
    const value = (v ?? '').trim();
    this.form.setText(this.fieldKey(), value);
    const valid = this.numberError() === '';
    const pathV = this.getVisualPath();
    this.liveXml.setValue(pathV, value);

    console.groupCollapsed('[field:update]');
    console.log('path  :', pathV);
    console.log('value :', value);
    console.log('valid :', valid);
    console.groupEnd();
  }

  numericPatterns(): string[] { return this.collectAllPatternsDeep(); }
  numericHtmlPattern(): string | null {
    const pats = this.numericPatterns();
    if (!pats.length) return null;
    return pats.length === 1 ? pats[0] : `(?:${pats.join(')|(?:')})`;
  }

  minAttr(): number | null {
    const f = this.effectiveNumericFacets();
    if (f.minInclusive != null) return f.minInclusive;
    if (f.minExclusive != null) return f.minExclusive + 1;
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

  numberError = computed(() => {
    const rawVal = (this.numberValue() ?? '').trim();
    if (rawVal === '') return 'Obrigatório';
    for (const pat of this.numericPatterns()) {
      const re = this.compileAnchoredRegex(pat);
      if (re && !re.test(rawVal)) return `Valor não atende ao padrão: ${pat}`;
    }
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

  // -------------------- Date --------------------
  private qnToToken(s?: string): string {
    if (!s) return '';
    return String(s).toLowerCase().trim()
      .replace(/^\{[^}]+\}/, '')
      .replace(/^[a-z_][\w.-]*:/, '')
      .trim();
  }

  isDateHere(): boolean {
    const k = (this.node.kind || '').toLowerCase();
    if (!(k === 'element' || k === 'simpletype')) return false;
    const tok = this.qnToToken(this.node.meta?.base) || this.qnToToken(this.node.meta?.typeName);
    return tok === 'date';
  }

  dateValue() { return this.textValue(); }

  onDate(v: string) {
    const value = (v ?? '').trim();
    this.form.setText(this.fieldKey(), value);
    const valid = this.dateError() === '';
    const pathV = this.getVisualPath();
    this.liveXml.setValue(pathV, value);

    console.groupCollapsed('[field:update]');
    console.log('path  :', pathV);
    console.log('value :', value);
    console.log('valid :', valid);
    console.groupEnd();
  }

  private dateFacetsHere() { return this.node.meta?.dateFacets ?? {}; }

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

  dateHint(): string {
    const f = this.dateFacetsHere();
    const bits: string[] = [];
    if (f.minInclusive) bits.push(`mín: ${f.minInclusive}`);
    if (f.minExclusive) bits.push(`> ${f.minExclusive}`);
    if (f.maxInclusive) bits.push(`máx: ${f.maxInclusive}`);
    if (f.maxExclusive) bits.push(`< ${f.maxExclusive}`);
    return bits.join(' · ');
  }

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

  // -------------------- LITE helpers --------------------
  isLeafNode(): boolean {
    return this.isEnumList() || this.isNumericInput() || this.isDateHere() || this.isStringInput();
  }
  displayValue(): string {
    if (this.isEnumList())     return this.selectedEnum() || '';
    if (this.isNumericInput()) return this.numberValue() || '';
    if (this.isDateHere())     return this.dateValue() || '';
    if (this.isStringInput())  return this.textValue() || '';
    return '';
  }
}
