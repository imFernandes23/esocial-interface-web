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

  get typeName(): string | undefined {
    return this.node?.meta?.typeName ?? this.node?.source?.meta?.typeName;
  }
  get base(): string | undefined {
    return this.node?.meta?.base ?? this.node?.source?.meta?.base;
  }
  get use(): string | undefined {
    return this.node?.meta?.use ?? this.node?.source?.meta?.use;
  }
  get docs(): string[] {
    return this.node?.meta?.docs ?? this.node?.source?.meta?.docs ?? [];
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
}
