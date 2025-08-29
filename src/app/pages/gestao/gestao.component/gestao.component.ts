import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { EventMeta, SchemaCatalogService } from '../../../services/schema-catalog.services';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-gestao.component',
  imports: [CommonModule, RouterLink],
  templateUrl: './gestao.component.html',
  styleUrl: './gestao.component.css'
})
export class GestaoComponent {
  private catalogSvc = inject(SchemaCatalogService);
  // alterna topo: 'novo' | 'filtrar'
  active = signal<'novo' | 'filtrar'>('novo');

  catalog$ = this.catalogSvc.catalog$;

  onGerarNovo() { this.active.set('novo'); }
  onFiltrar()    { this.active.set('filtrar'); }

  // search local para a lista
  query = signal('');
  filter(list: EventMeta[], q: string) {
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter(e =>
      e.id?.toLowerCase().includes(s) ||
      e.title?.toLowerCase().includes(s) ||
      e.fileName?.toLowerCase().includes(s) ||
      e.description?.toLowerCase().includes(s)
    );
  }
}
