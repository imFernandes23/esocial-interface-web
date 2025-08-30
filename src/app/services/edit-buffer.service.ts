import { Injectable } from '@angular/core';
import { StringFacets } from '../shared/models/schema-models';

export type NumericEdit = {
  minInclusive?: number; maxInclusive?: number;
  minExclusive?: number; maxExclusive?: number;
  totalDigits?: number; fractionDigits?: number;
  pattern?: string;
};

export type DateEdit = {
  minInclusive?: string; maxInclusive?: string;
  minExclusive?: string; maxExclusive?: string;
  pattern?: string;
};

@Injectable({
  providedIn: 'root',
})
export class EditBufferService {
  // Editar Enums
  private removed = new Set<string>();

  private key(contextId: string, value: string) {
    return `${contextId}|${value}`;
  }

  removeEnum(contextId: string, value: string) {
    this.removed.add(this.key(contextId, value));
  }

  undoEnum(contextId: string, value: string) {
    this.removed.delete(this.key(contextId, value));
  }

  isEnumRemoved(contextId: string, value: string): boolean {
    return this.removed.has(this.key(contextId, value));
  }

  snapshot() {
    return Array.from(this.removed.values());
  }

  ///Editar Ocorrencias

  clear() {
    this.removed.clear();
  }

  private occurs = new Map<string, { min: number; max: number | 'unbounded' }>();

  setOccurs(contextId: string, min: number, max: number | 'unbounded') {
    this.occurs.set(contextId, { min, max });
  }
  getOccursMin(contextId: string) {
    return this.occurs.get(contextId)?.min;
  }
  getOccursMax(contextId: string) {
    return this.occurs.get(contextId)?.max;
  }

  snapshotOccurs() {
    return Array.from(this.occurs.entries()); // [ [contextId, {min,max}], ... ]
  }

  clearOccurs() {
    this.occurs.clear();
  }

  /// Editar String Facets

  private stringEdits = new Map<string, StringFacets>();

  setStringFacets(ctxId: string, f: StringFacets) {
    this.stringEdits.set(ctxId, { ...f });
  }
  getStringFacets(ctxId: string) {
    return this.stringEdits.get(ctxId);
  }
  snapshotStringFacets() {
    return Array.from(this.stringEdits.entries());
  }
  clearStringFacets() {
    this.stringEdits.clear();
  }

  //// Editar Numeric facets
  private numericEdits = new Map<string, NumericEdit>();

  setNumericFacets(ctxId: string, f: NumericEdit) {
    this.numericEdits.set(ctxId, { ...f });
  }
  getNumericFacets(ctxId: string) { return this.numericEdits.get(ctxId); }
  snapshotNumericFacets() { return Array.from(this.numericEdits.entries()); }
  clearNumericFacets(){ this.numericEdits.clear(); }


  //// Editar Date type
  private dateEdits = new Map<string, DateEdit>();
  setDateFacets(id: string, f: DateEdit) { this.dateEdits.set(id, { ...f }); }
  getDateFacets(id: string) { return this.dateEdits.get(id); }
  snapshotDateFacets() { return Array.from(this.dateEdits.entries()); }
  clearDateFacets(){ this.dateEdits.clear(); }
}
