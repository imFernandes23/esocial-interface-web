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
