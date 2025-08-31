import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
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

  @ViewChild('xmlDlg') xmlDlg!: ElementRef<HTMLDialogElement>;
  xmlText = '';
  xmlOk = true;
  requiredOk = true;
  xmlErr = '';
  missingRequired: string[] = [];

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

    // abre o modal com o XML atual, já bonito
  openXmlModal(): void {
    this.xmlText = this.liveXml.serialize(true);
    this.revalidateXmlAndRequired();
    this.xmlDlg.nativeElement.showModal();
  }

  closeXmlModal(): void {
    this.xmlDlg.nativeElement.close();
  }

  onXmlInput(ev: Event): void {
    this.xmlText = (ev.target as HTMLTextAreaElement).value ?? '';
    this.revalidateXmlAndRequired();
  }

  private updateXmlValidity(): void {
    const res = this.liveXml.validateXml(this.xmlText);
    this.xmlOk = res.ok;
    this.xmlErr = res.error || '';
  }

  // validação combinada
  private revalidateXmlAndRequired(): void {
    // 1) valida sintaxe
    const v = this.liveXml.validateXml(this.xmlText);
    this.xmlOk = v.ok;
    this.xmlErr = v.error || '';

    // 2) para validar obrigatórios, importamos em um DOM separado (não suja o vivo)
    if (this.xmlOk) {
      // snapshot do doc “editado” para checar (não precisa guardar)
      const doc = new DOMParser().parseFromString(this.xmlText, 'application/xml');

      // usamos os mesmos helpers, mas precisamos apontar temporariamente o doc:
      // solução simples: crie um método ‘validateRequiredOn(doc)’ no serviço OU faça local:

      this.missingRequired = this.collectMissingRequiredFromDoc(doc);
      this.requiredOk = this.missingRequired.length === 0;
    } else {
      this.missingRequired = [];
      this.requiredOk = false;
    }
  }

  /** Aplica o XML editado no formulário (Live XML -> form) */
  applyXmlToForm(): void {
    if (!this.xmlOk) return;
    this.liveXml.import(this.xmlText); // hidrata todo o form (já estamos inscritos nos paths)
    // mantém o modal aberto para novas edições, ou feche se preferir:
    // this.closeXmlModal();
  }

  /** Baixar .xml */
  downloadXml(): void {
    const blob = new Blob([this.xmlText], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'evento.xml';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Salvar rascunho no navegador */
  saveXmlLocal(): void {
    localStorage.setItem('esocial.liveXml.draft', this.xmlText);
  }

  /** Carregar rascunho salvo */
  loadXmlLocal(): void {
    const raw = localStorage.getItem('esocial.liveXml.draft');
    if (raw != null) {
      this.xmlText = raw;
      this.updateXmlValidity();
    }
  }

  /** Pega da view tree os campos obrigatórios (minOccurs >=1) e confere no doc */
  private collectMissingRequiredFromDoc(doc: Document): string[] {
    const req: string[] = [];

    const rootNode = this.root?.(); // sua view tree raiz
    if (!rootNode) return req;

    // Ajuda: coleta paths ‘visuais’ obrigatórios (apenas elementos)
    const collect = (n: any, prefix: string) => {
      const kind = (n.kind || '').toLowerCase();
      const name = n.name || '';

      if (this.isIgnoredName(name)) return;

      // monta o path visual atual (sem [n] aqui; repetidos serão contados pelo count)
      const curPath = kind === 'element'
        ? (prefix ? `${prefix}/${name}` : name)
        : prefix;

      // choice: se o choice em si for obrigatório, exigimos que exista pelo menos 1 filho presente
      if (kind === 'choice') {
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          // basta que exista um dos filhos
          const present = (n.children ?? []).some((c: any) => {
            if ((c.kind || '').toLowerCase() !== 'element') return false;
            const p = `${curPath}/${c.name}`;
            return this.countInDoc(doc, p) > 0;
          });
          if (!present) req.push(`${curPath} [escolha um]`);
        }
      }

      // element com filhos
      if (kind === 'element' && n.children?.length) {
        // se este elemento é obrigatório (minOccurs>=1), exija a presença do próprio nó
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          if (this.countInDoc(doc, curPath) < 1) req.push(curPath);
        }
        // desce
        for (const c of n.children) collect(c, curPath);
      }

      // leaf (element simples)
      if (kind === 'element' && (!n.children || n.children.length === 0)) {
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          // exige texto presente
          if (!this.textInDoc(doc, curPath)) req.push(curPath);
        }
      }

      // sequence / complexType / etc – só desce
      if ((kind === 'sequence' || kind === 'complextype' || kind === 'schema' || kind === 'simpletype' || kind === 'group') && n.children) {
        for (const c of n.children) collect(c, curPath);
      }
    };

    collect(rootNode, '');

    // normaliza paths para ‘eSocial/...’
    return req.map(p => (p.startsWith('eSocial') ? p : `eSocial/${p}`));
  }

/** --- helpers (lendo o doc passado, sem mexer no vivo) --- */

  private isIgnoredName(name: string | undefined): boolean {
    if (!name) return false;
    // ignora qualquer nó com prefixo ds: (ex.: ds:Signature)
    return /^ds:/i.test(name);
  }

  private textInDoc(doc: Document, path: string): string | null {
    const parts = path.split('/').filter(Boolean);
    let el: Element | null = doc.documentElement;

    if (!el || el.tagName !== parts[0]) return null;

    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i].replace(/\[\d+]/, ''); // remove [n]
      const children: Element[] = Array.from(el.children);
      const matches: Element[] = children.filter((child: Element) => child.tagName === seg);
      if (matches.length === 0) return null;
      el = matches[0] ?? null;
      if (!el) return null;
    }

    const t = (el.textContent ?? '').trim();
    return t.length ? t : null;
  }

private countInDoc(doc: Document, path: string): number {
  const parts = path.split('/').filter(Boolean);
  let el: Element | null = doc.documentElement;
  if (!el || el.tagName !== parts[0]) return 0;

  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
    const name = m?.[1] ?? parts[i];
    const idx  = m?.[2] ? parseInt(m![2], 10) : undefined;

    const children: Element[] = Array.from(el.children);
    const matches: Element[] = children.filter((child: Element) => child.tagName === name);

    if (idx != null) {
      if (idx < 1 || idx > matches.length) return 0;
      el = matches[idx - 1] ?? null;
      if (!el) return 0;
    } else {
      if (i === parts.length - 1) return matches.length; // último segmento sem índice
      el = matches[0] ?? null;
      if (!el) return 0;
    }
  }
  return el ? 1 : 0;
}

}
