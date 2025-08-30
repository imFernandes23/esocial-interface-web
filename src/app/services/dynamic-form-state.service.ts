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

  /** enum: nodeId (do bloco enumeration) -> valor (ex.: "01") */
  private enumMap = signal<Record<string, string>>({});
  getEnum(nodeId: string): string | undefined { return this.enumMap()[nodeId]; }
  setEnum(nodeId: string, value: string) {
    this.enumMap.update(m => ({ ...m, [nodeId]: value }));
  }
  clearEnum(nodeId: string) {
    const { [nodeId]: _, ...rest } = this.enumMap();
    this.enumMap.set(rest);
  }

  // STRING VALUE //
  private textMap = signal<Record<string, string>>({});
  getText(id: string) { return this.textMap()[id] ?? ''; }
  setText(id: string, value: string) { this.textMap.update(m => ({ ...m, [id]: value })); }
  clearText(id: string) { const { [id]:_, ...r } = this.textMap(); this.textMap.set(r); }

  /** Stubs p/ futuro: carregar de XML e gerar XML */
  loadFromXml(_xml: string) {/* TODO: parsear e popular choiceMap */}
  toXml(): string {/* TODO: serializar usando choiceMap */ return ''; }
}
