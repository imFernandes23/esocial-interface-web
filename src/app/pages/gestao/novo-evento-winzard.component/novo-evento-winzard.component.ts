import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SchemaTreeAdapterService } from '../../../services/schema-tree-adapter.service';
import { XsTreeNodeComponent } from '../../../component/xs-tree/xs-tree-node.component/xs-tree-node.component';
import { ViewNode } from '../../../shared/models/schema-models';

@Component({
  selector: 'app-novo-evento-winzard',
  imports: [CommonModule, RouterLink, XsTreeNodeComponent],
  templateUrl: './novo-evento-winzard.component.html',
  styleUrl: './novo-evento-winzard.component.css'
})
export class NovoEventoWinzardComponent {
  private route = inject(ActivatedRoute);
  private adapter = inject(SchemaTreeAdapterService);

  headerTitle = signal<string>('—');
  root = signal<ViewNode | null>(null);

  constructor() {
    const fileName = decodeURIComponent(this.route.snapshot.paramMap.get('fileName') || '');
    const { code, title, root } = this.adapter.buildViewTreeFromLatest(fileName);

    // título: S-1234 - Nome do Evento (sem duplicar)
    const startsWithCode = new RegExp(`^\\s*${code}\\b`, 'i').test(title);
    this.headerTitle.set(startsWithCode ? title : `${code} - ${title}`);

    this.root.set(root);

    // DEBUG opcional
    console.groupCollapsed('[VIEW TREE]', fileName);
    console.log({ meta: { code, title, fileName }, root });
    console.groupEnd();
    (window as any).__viewTree = root;
  }

  expandAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.setAttribute('open',''));
  }
  collapseAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.removeAttribute('open'));
  }
}
