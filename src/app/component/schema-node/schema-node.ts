import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ViewNode } from '../../shared/models/schema-models';

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

  onHeaderClick(ev: Event) {
    ev.stopPropagation(); // não deixa subir pro root
    this.open = !this.open;
  }

  trackById = (_: number, n: ViewNode) => n.id;
}
