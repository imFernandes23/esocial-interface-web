import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EditBufferService {
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

  clear() {this.removed.clear()}
}
