import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SchemaTreeAdapterService } from '../../../services/schema-tree-adapter.service';
import { XsTreeNodeComponent } from '../../../component/xs-tree/xs-tree-node.component/xs-tree-node.component';
import { ViewNode } from '../../../shared/models/schema-models';
import { LiveXmlService } from '../../../services/live-xml.service';

@Component({
  selector: 'app-novo-evento-winzard',
  imports: [CommonModule, RouterLink, XsTreeNodeComponent],
  templateUrl: './novo-evento-winzard.component.html',
  styleUrl: './novo-evento-winzard.component.css'
})
export class NovoEventoWinzardComponent implements OnInit{
  private route = inject(ActivatedRoute);
  private adapter = inject(SchemaTreeAdapterService);
  private eventName: string = '';

  headerTitle = signal<string>('—');
  root = signal<ViewNode | null>(null);

  ngOnInit(): void {
    this.bootstrapLiveXml();
  }

  constructor(
    private liveXml: LiveXmlService
  ) {
    const fileName = decodeURIComponent(this.route.snapshot.paramMap.get('fileName') || '');
    const { code, title, root } = this.adapter.buildViewTreeFromLatest(fileName);

    // título: S-1234 - Nome do Evento (sem duplicar)
    const startsWithCode = new RegExp(`^\\s*${code}\\b`, 'i').test(title);
    this.headerTitle.set(startsWithCode ? title : `${code} - ${title}`);

    this.root.set(root);
    this.eventName = fileName.replace(".xsd", "");



    // DEBUG opcional
    console.groupCollapsed('[VIEW TREE]', fileName);
    console.log({ meta: { code, title, fileName }, root });
    console.groupEnd();
    (window as any).__viewTree = root;
  }

  private bootstrapLiveXml() {

    this.liveXml.init('eSocial');

    // garante a tag do evento
    const evtPath = `eSocial/${this.eventName}`;
    this.liveXml.ensurePath(evtPath);

    // gera um Id e seta como atributo
    const id = this.generateEventId(/* opcional CNPJ */);
    const attrPath = `${evtPath}/@Id`;
    this.liveXml.setValue(attrPath, id);

    // debug: garanta que está no lugar certo
    console.log('[liveXML] set Id em', attrPath, '=>', this.liveXml.getValue(attrPath));
  }

  private generateEventId(cnpj?: string): string {
    const pad = (n: number, l: number) => n.toString().padStart(l, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1,2)}${pad(now.getDate(),2)}${pad(now.getHours(),2)}${pad(now.getMinutes(),2)}${pad(now.getSeconds(),2)}`;
    const seq = Math.floor(Math.random() * 1e7).toString().padStart(7, '0');
    return `ID${(cnpj ?? '00000000000000')}${ts}${seq}`;
  }

  expandAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.setAttribute('open',''));
  }
  collapseAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.removeAttribute('open'));
  }

  onGerarXmlConsole(): void {
    const xml = this.liveXml.serialize(true);
    console.log('[LiveXML] XML gerado:\n' + xml);
  }

}
