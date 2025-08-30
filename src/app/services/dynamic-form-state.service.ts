import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DynamicFormStateService {
  /** nodeId -> childId selecionado */
  private choiceMap = signal<Record<string, string>>({});

  getChoice(nodeId: string): string | undefined {
    return this.choiceMap()[nodeId];
  }
  setChoice(nodeId: string, childId: string) {
    this.choiceMap.update(m => ({ ...m, [nodeId]: childId }));
  }
  clearChoice(nodeId: string) {
    const { [nodeId]: _, ...rest } = this.choiceMap();
    this.choiceMap.set(rest);
  }

  /** Stubs p/ futuro: carregar de XML e gerar XML */
  loadFromXml(_xml: string) {/* TODO: parsear e popular choiceMap */}
  toXml(): string {/* TODO: serializar usando choiceMap */ return ''; }
}
