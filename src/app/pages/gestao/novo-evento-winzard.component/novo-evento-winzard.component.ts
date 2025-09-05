// novo-evento-winzard.component.ts
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, OnInit, signal, ViewChild, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SchemaTreeAdapterService } from '../../../services/schema-tree-adapter.service';
import { XsTreeNodeComponent } from '../../../component/xs-tree/xs-tree-node.component/xs-tree-node.component';
import { ViewNode } from '../../../shared/models/schema-models';
import { LiveXmlService } from '../../../services/live-xml.service';

@Component({
  selector: 'app-novo-evento-winzard',
  standalone: true,
  imports: [CommonModule, RouterLink, XsTreeNodeComponent],
  templateUrl: './novo-evento-winzard.component.html',
  styleUrl: './novo-evento-winzard.component.css'
})
export class NovoEventoWinzardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private adapter = inject(SchemaTreeAdapterService);
  private liveXml = inject(LiveXmlService);

  // precisa ser público para o template
  eventName = '';

  // UI state
  @ViewChild('xmlDlg') xmlDlg!: ElementRef<HTMLDialogElement>;
  xmlText = '';
  xmlOk = true;
  requiredOk = true;
  xmlErr = '';
  missingRequired: string[] = [];

  // cabeçalho e árvore
  headerTitle = signal<string>('—');
  root = signal<ViewNode | null>(null);

  // modo compacto (lite)
  lite = signal<boolean>(false);
  toggleLite() { this.lite.update(v => !v); }

  // prefixo visual absoluto para o form/LiveXML
  eventVPrefix = computed(() => `eSocial/${this.eventName}`);

  constructor() {
    const fileName = decodeURIComponent(this.route.snapshot.paramMap.get('fileName') || '');
    const { code, title, root } = this.adapter.buildViewTreeFromLatest(fileName);

    const startsWithCode = new RegExp(`^\\s*${code}\\b`, 'i').test(title);
    this.headerTitle.set(startsWithCode ? title : `${code} - ${title}`);

    this.root.set(root);
    this.eventName = fileName.replace('.xsd', '');

    // DEBUG opcional
    console.groupCollapsed('[VIEW TREE]', fileName);
    console.log({ meta: { code, title, fileName }, root });
    console.groupEnd();
    (window as any).__viewTree = root;
  }

  ngOnInit(): void {
    this.bootstrapLiveXml();
  }

  // ---------- Live XML bootstrap ----------
  private bootstrapLiveXml() {
    this.liveXml.init('eSocial');

    const evtPath = `eSocial/${this.eventName}`;
    this.liveXml.ensurePath(evtPath);

    const id = this.generateEventId();
    this.liveXml.setValue(`${evtPath}/@Id`, id);
    console.log('[liveXML] set Id em', `${evtPath}/@Id`, '=>', this.liveXml.getValue(`${evtPath}/@Id`));
  }

  private generateEventId(cnpj?: string): string {
    const pad = (n: number, l: number) => n.toString().padStart(l, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
    const seq = Math.floor(Math.random() * 1e7).toString().padStart(7, '0');
    return `ID${(cnpj ?? '00000000000000')}${ts}${seq}`;
  }

  // ---------- Expand/Collapse ----------
  expandAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.setAttribute('open', ''));
  }
  collapseAll() {
    document.querySelectorAll<HTMLElement>('details.node, details.docs')
      .forEach(d => d.removeAttribute('open'));
  }

  // ---------- XML modal / preview ----------
  onGerarXmlConsole(): void {
    const xml = this.liveXml.serialize(true);
    console.log('[LiveXML] XML gerado:\n' + xml);
  }

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

  // validação combinada (bem leve)
  private revalidateXmlAndRequired(): void {
    const v = this.liveXml.validateXml(this.xmlText);
    this.xmlOk = v.ok;
    this.xmlErr = v.error || '';

    if (this.xmlOk) {
      const doc = new DOMParser().parseFromString(this.xmlText, 'application/xml');
      this.missingRequired = this.collectMissingRequiredFromDoc(doc);
      this.requiredOk = this.missingRequired.length === 0;
    } else {
      this.missingRequired = [];
      this.requiredOk = false;
    }
  }

  /** aplica o XML editado no DOM vivo (e emite para os inputs ligados) */
  applyXmlToForm(): void {
    if (!this.xmlOk) return;
    this.liveXml.import(this.xmlText);
  }

  // ---------- utilidades de arquivo ----------
  downloadXml(): void {
    const blob = new Blob([this.xmlText], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'evento.xml';
    a.click();
    URL.revokeObjectURL(url);
  }
  saveXmlLocal(): void {
    localStorage.setItem('esocial.liveXml.draft', this.xmlText);
  }
  loadXmlLocal(): void {
    const raw = localStorage.getItem('esocial.liveXml.draft');
    if (raw != null) {
      this.xmlText = raw;
      this.updateXmlValidity();
    }
  }

  // ---------- valida obrigatórios no doc passado ----------
  private collectMissingRequiredFromDoc(doc: Document): string[] {
    const req: string[] = [];
    const rootNode = this.root?.();
    if (!rootNode) return req;

    const collect = (n: any, prefix: string) => {
      const kind = (n.kind || '').toLowerCase();
      const name = n.name || '';

      if (this.isIgnoredName(name)) return;

      const curPath = kind === 'element'
        ? (prefix ? `${prefix}/${name}` : name)
        : prefix;

      if (kind === 'choice') {
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          const present = (n.children ?? []).some((c: any) => {
            if ((c.kind || '').toLowerCase() !== 'element') return false;
            const p = `${curPath}/${c.name}`;
            return this.countInDoc(doc, p) > 0;
          });
          if (!present) req.push(`${curPath} [escolha um]`);
        }
      }

      if (kind === 'element' && n.children?.length) {
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          if (this.countInDoc(doc, curPath) < 1) req.push(curPath);
        }
        for (const c of n.children) collect(c, curPath);
      }

      if (kind === 'element' && (!n.children || n.children.length === 0)) {
        const min = n.meta?.occurs?.min ?? 1;
        if (min > 0) {
          if (!this.textInDoc(doc, curPath)) req.push(curPath);
        }
      }

      if ((kind === 'sequence' || kind === 'complextype' || kind === 'schema' || kind === 'simpletype' || kind === 'group') && n.children) {
        for (const c of n.children) collect(c, curPath);
      }
    };

    collect(rootNode, '');

    return req.map(p => (p.startsWith('eSocial') ? p : `eSocial/${p}`));
  }

  // ---- helpers p/ leitura do doc (sem mexer no vivo) ----
  private isIgnoredName(name: string | undefined): boolean {
    if (!name) return false;
    return /^ds:/i.test(name);
  }

  private textInDoc(doc: Document, path: string): string | null {
    const parts = path.split('/').filter(Boolean);
    let el: Element | null = doc.documentElement;
    if (!el || el.tagName !== parts[0]) return null;

    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i].replace(/\[\d+]/, '');
      const matches:any = Array.from(el.children).filter((child: Element) => child.tagName === seg);
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

      const matches:any = Array.from(el.children).filter((child: Element) => child.tagName === name);

      if (idx != null) {
        if (idx < 1 || idx > matches.length) return 0;
        el = matches[idx - 1] ?? null;
        if (!el) return 0;
      } else {
        if (i === parts.length - 1) return matches.length;
        el = matches[0] ?? null;
        if (!el) return 0;
      }
    }
    return el ? 1 : 0;
  }
}
