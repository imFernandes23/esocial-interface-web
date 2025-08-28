import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EditBufferService {

  // Editar Enums
  private removed = new Set<string>();

  private key(contextId: string, value: string){
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

  clear() {this.removed.clear()}

  private occurs = new Map<string, { min: number; max: number|'unbounded' }>();

  setOccurs(contextId: string, min: number, max: number|'unbounded') {
    this.occurs.set(contextId, { min, max });
  }
  getOccursMin(contextId: string){ return this.occurs.get(contextId)?.min; }
  getOccursMax(contextId: string){ return this.occurs.get(contextId)?.max; }

  snapshotOccurs(){
    return Array.from(this.occurs.entries()); // [ [contextId, {min,max}], ... ]
  }

  clearOccurs(){ this.occurs.clear(); }
}
