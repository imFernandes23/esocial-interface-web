import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ViewNode } from '../../shared/models/schema-models';
import { EditBufferService } from '../../services/edit-buffer.service';

@Component({
  selector: 'app-schema-node',
  imports: [CommonModule],
  templateUrl: './schema-node.html',
  styleUrl: './schema-node.css'
})
export class SchemaNode {
  @Input() node!: ViewNode;
  @Input() depth = 0;

  open = false;

  constructor(private edits: EditBufferService) {}

  onHeaderClick(ev: Event) {
    ev.stopPropagation(); // não deixa subir pro root
    this.open = !this.open;
  }


  //// Getter numerics

  get isNumericSimpleType(): boolean {
    const base = (this.base || '').toLowerCase();
    const isSimple = this.node.kind === 'simpleType' || this.node.source?.kind === 'simpleType';
    const numeric = /^xs:(byte|short|int|integer|long|nonnegativeinteger|nonpositiveinteger|positiveinteger|negativeinteger|unsignedbyte|unsignedshort|unsignedint|unsignedlong|decimal)$/.test(base);
    const hasEnums = !!((this.node.meta as any)?.numericFacets?.enums?.length
                    || (this.node.source as any)?.numericFacets?.enums?.length);
    return isSimple && numeric && !hasEnums;
  }
  get showNumericEditor(): boolean { return this.isNumericSimpleType; }

  get numericFacets() {
    return this.node.meta?.numericFacets ?? this.node.source?.meta?.numericFacets;
  }
  get inferredNum(): {min?: number; max?: number} | undefined {
    return (this.node.meta as any)?.inferred ?? (this.node.source as any)?.inferred;
  }

  // flags por campo → só renderiza se houver valor OU (no caso de min/max) sugestão
  get showMinInclusive(){ return this.numericFacets?.minInclusive !== undefined || this.inferredNum?.min !== undefined; }
  get showMinExclusive(){ return this.numericFacets?.minExclusive !== undefined; }
  get showMaxInclusive(){ return this.numericFacets?.maxInclusive !== undefined || this.inferredNum?.max !== undefined; }
  get showMaxExclusive(){ return this.numericFacets?.maxExclusive !== undefined; }
  get showTotalDigits(){ return this.numericFacets?.totalDigits !== undefined; }
  get showFractionDigits(){ return this.numericFacets?.fractionDigits !== undefined; }
  get showNumPattern(){ return this.numericFacets?.pattern !== undefined; }

  get nfDraft() {
    return this.edits.getNumericFacets(this.node.id) ?? { ...(this.numericFacets ?? {}) };
  }

  private readonly NUM_FACET_KINDS = new Set([
  'minInclusive','maxInclusive','minExclusive','maxExclusive','totalDigits','fractionDigits','pattern'
  ]);

  filteredChildrenNum() {
    const kids = this.node.children ?? [];
    if (!this.showNumericEditor) return kids;
    return kids.filter(k => !this.NUM_FACET_KINDS.has(k.kind));
  }

  //// Getter de string facets

  get inferredString(): {minLength?: number; maxLength?: number} | undefined {
    return (this.node.meta as any)?.inferred ?? (this.node.source as any)?.inferred;
  }

  get minLenForForm(): number | '' {
    return this.edits.getStringFacets(this.node.id)?.minLength
        ?? this.stringFacets?.minLength
        ?? this.inferredString?.minLength
        ?? '';
  }
  get maxLenForForm(): number | '' {
    return this.edits.getStringFacets(this.node.id)?.maxLength
        ?? this.stringFacets?.maxLength
        ?? this.inferredString?.maxLength
        ?? '';
  }

  get isStringType(): boolean {
    const base = this.base?.toLowerCase();
    return !!(base && (base === 'xs:string' || base.endsWith(':string')));
  }
  get sfDraft(): any {
    return this.edits.getStringFacets(this.node.id) ?? { ...(this.stringFacets ?? {}) };
  }

  get stringFacets() {
    return this.node.meta?.stringFacets ?? this.node.source?.meta?.stringFacets ?? undefined;
  }

  get isStringSimpleType(): boolean {
    const base = (this.base || '').toLowerCase();
    const isSimple = this.node.kind === 'simpleType' || this.node.source?.kind === 'simpleType';
    return isSimple && (base.endsWith(':string'));
  }

  get showStringEditor(): boolean {
    return this.isStringSimpleType && !!this.stringFacets;
  }

  get inferredMax(): number | undefined {
    return (this.node.meta as any)?.inferred?.maxLengthFromName
        ?? (this.node.source?.meta as any)?.inferred?.maxLengthFromName;
  }

  get maxForForm(): number | '' {
    const edited = this.edits.getStringFacets(this.node.id)?.maxLength;
    if (edited !== undefined) return edited;
    const facet = this.stringFacets?.maxLength;
    if (facet !== undefined) return facet;
    return this.inferredMax ?? '';
  }
  
  //// Getter de Ocorencias
  
  get occurs(): { min: number; max: number|'unbounded'} | null {
    return (this.node.meta?.occurs ?? this.node.source?.meta?.occurs) ?? null;
  }
  get showOccursEditor(): boolean {
    const oc = this.occurs;
    if (!oc) return false;
    const min = oc.min ?? 1;
    const max = oc.max ?? 1;

    return !(min === 1 && max === 1);
  }

  get occMin(): number {
    const v = this.edits.getOccursMin(this.node.id);
    return v ?? (this.occurs?.min ?? 1);
  }
  get occMax(): number | 'unbounded' {
    const v = this.edits.getOccursMax(this.node.id);
    return v ?? (this.occurs?.max ?? 1);
  }

  ///// Getter de Documentação e Cabeçalho

  get docs(): string[] {
    return this.node?.meta?.docs ?? this.node?.source?.meta?.docs ?? [];
  }
  get typeName(): string | undefined {
    return this.node?.meta?.typeName ?? this.node?.source?.meta?.typeName;
  }
  get base(): string | undefined {
    return this.node?.meta?.base ?? this.node?.source?.meta?.base;
  }
  get use(): string | undefined {
    return this.node?.meta?.use ?? this.node?.source?.meta?.use;
  }
///////////////////////// Funções manipuladoras /////////////////////////////////
  // numeric Helpers
  private clampMin(n?: number) {
    const curInc = this.numericFacets?.minInclusive;
    const curExc = this.numericFacets?.minExclusive;
    if (curInc !== undefined && n !== undefined) n = Math.max(n, curInc);
    if (curExc !== undefined && n !== undefined) n = Math.max(n, curExc + 1); // mais restrito que exclusivo atual
    return n;
  }
  private clampMax(n?: number) {
    const curInc = this.numericFacets?.maxInclusive;
    const curExc = this.numericFacets?.maxExclusive;
    if (curInc !== undefined && n !== undefined) n = Math.min(n, curInc);
    if (curExc !== undefined && n !== undefined) n = Math.min(n, curExc - 1);
    return n;
  }

  setMinInclusive(n: number) {
    const v = this.clampMin(Number.isFinite(n) ? Math.floor(n) : undefined);
    const f = { ...this.nfDraft, minInclusive: v };
    delete f.minExclusive; // conflitantes
    this.edits.setNumericFacets(this.node.id, f);
  }
  setMinExclusive(n: number) {
    const v = this.clampMin(Number.isFinite(n) ? Math.floor(n) : undefined);
    const f = { ...this.nfDraft, minExclusive: v };
    delete f.minInclusive;
    this.edits.setNumericFacets(this.node.id, f);
  }
  setMaxInclusive(n: number) {
    const v = this.clampMax(Number.isFinite(n) ? Math.floor(n) : undefined);
    const f = { ...this.nfDraft, maxInclusive: v };
    delete f.maxExclusive;
    this.edits.setNumericFacets(this.node.id, f);
  }
  setMaxExclusive(n: number) {
    const v = this.clampMax(Number.isFinite(n) ? Math.floor(n) : undefined);
    const f = { ...this.nfDraft, maxExclusive: v };
    delete f.maxInclusive;
    this.edits.setNumericFacets(this.node.id, f);
  }
  setTotalDigits(n: number) {
    const f = { ...this.nfDraft, totalDigits: (Number.isFinite(n) && n>0) ? Math.floor(n) : undefined };
    this.edits.setNumericFacets(this.node.id, f);
  }
  setFractionDigits(n: number) {
    const f = { ...this.nfDraft, fractionDigits: (Number.isFinite(n) && n>=0) ? Math.floor(n) : undefined };
    this.edits.setNumericFacets(this.node.id, f);
  }
  setNumPattern(p: string) {
    const f = { ...this.nfDraft, pattern: p || undefined };
    this.edits.setNumericFacets(this.node.id, f);
  }

  // String Facets Helpers

  setMinLen(n: number) {
    const cur = this.stringFacets?.minLength ?? 0;
    const next = Math.max(cur, Math.max(0, Math.floor(n || 0)));
    const f = { ...this.sfDraft, minLength: next };
    // se length existir, mantenha coerência
    if (f.length !== undefined) f.length = Math.max(f.length, next);
    this.edits.setStringFacets(this.node.id, f);
  }
  setMaxLen(n: number) {
    const cur = this.stringFacets?.maxLength ?? Infinity;
    const next = Math.min(cur, Math.max(1, Math.floor(n || 1)));
    const f = { ...this.sfDraft, maxLength: next };
    if (f.length !== undefined) f.length = Math.min(f.length, next);
    // se min > max, force min = max
    if (f.minLength !== undefined && f.minLength > next) f.minLength = next;
    this.edits.setStringFacets(this.node.id, f);
  }
  setLen(n: number) {
    const curLen = this.stringFacets?.length;
    const curMin = this.stringFacets?.minLength ?? 0;
    const curMax = this.stringFacets?.maxLength ?? Infinity;
    const next = Math.max(curLen ?? 0, Math.max(curMin, Math.min(curMax, Math.floor(n || 0))));
    const f = { ...this.sfDraft, length: next, minLength: next, maxLength: Math.min(curMax, next) };
    this.edits.setStringFacets(this.node.id, f);
  }
  setPattern(p: string) {
    const list = (this.sfDraft.patterns ?? []).slice(0, 1); // MVP: 1 pattern
    list[0] = p;
    this.edits.setStringFacets(this.node.id, { ...this.sfDraft, patterns: list });
  }

  // Occurs helpers
  setOccMin(n: number) {
    const max = this.occMax === 'unbounded' ? Infinity : (this.occMax as number);
    const clamped = Math.max(0, Math.min(n, max));
    this.edits.setOccurs(this.node.id, clamped, this.occMax);
  }
  setOccMax(n: number|'unbounded') {
    const min = this.occMin;
    let use = n;
    if (n !== 'unbounded') {
      const num = Math.max(min, Number(n || 0));
      use = num < 1 ? 1 : num; // nunca 0 quando é máximo
    }
    this.edits.setOccurs(this.node.id, this.occMin, use);
  }

  toggleUnbounded(checked: boolean) {
    this.setOccMax(checked ? 'unbounded' : Math.max(this.occMin, 50));
  }

  // enum Helpers
  isEnumRemoved(valueNode: ViewNode): boolean {
    // contexto: id do nó enumeration (pai direto)
    const contexId = this.node.id;
    return this.edits.isEnumRemoved(contexId, valueNode.name)
  }
  removeEnum(valueNode: ViewNode) {
    const contextId = this.node.id;
    this.edits.removeEnum(contextId, valueNode.name);
  }
  undoEnum(valueNode: ViewNode) {
    const contextId = this.node.id;
    this.edits.undoEnum(contextId, valueNode.name);
  }

  trackById = (_: number, n: ViewNode) => n.id;
  trackStr  = (_: number, s: string) => s;


  private readonly STRING_FACET_KINDS = new Set(['length','minLength','maxLength','pattern']);
  private readonly NUMERIC_FACET_KINDS = new Set([
  'minInclusive','maxInclusive','minExclusive','maxExclusive','totalDigits','fractionDigits','pattern'
]);

  filteredChildren() {
    let kids = this.node.children ?? [];
    if (this.showStringEditor) {
      kids = kids.filter(k => !this.STRING_FACET_KINDS.has(k.kind));
    }
    if (this.showNumericEditor) {
      kids = kids.filter(k => !this.NUMERIC_FACET_KINDS.has(k.kind));
    }
  return kids;
  }
}


