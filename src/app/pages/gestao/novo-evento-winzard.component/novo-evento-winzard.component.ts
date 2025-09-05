// novo-evento-winzard.component.ts
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, OnInit, signal, ViewChild, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SchemaTreeAdapterService } from '../../../services/schema-tree-adapter.service';
import { XsTreeNodeComponent } from '../../../component/xs-tree/xs-tree-node.component/xs-tree-node.component';
import { ViewNode } from '../../../shared/models/schema-models';
import { LiveXmlService } from '../../../services/live-xml.service';
import { DynamicFormStateService } from '../../../services/dynamic-form-state.service';

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
  private form   = inject(DynamicFormStateService);
  private eventName: string = '';


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
    this.refreshXmlFromForm();
  }

  // ---------- Live XML bootstrap ----------
  private bootstrapLiveXml() {
    this.liveXml.init('eSocial');
    const evtPath = `eSocial/${this.eventName}`;
    this.liveXml.ensurePath(evtPath);

    // Id inicial (se ainda não existir)
    if (!this.liveXml.getValue(`${evtPath}/@Id`)) {
      this.liveXml.setValue(`${evtPath}/@Id`, this.generateEventId());
    }
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
  private getDraftKey(): string {
    return `esocial.event.draft:${this.eventName}`;
  }

  private getLegacyDraftKey(): string {
    return 'esocial.liveXml.draft';
  }

  saveDraftFromForm(): void {
    const xml = this.liveXml.serialize(true); 
    localStorage.setItem(this.getDraftKey(), xml);
    alert('Rascunho salvo (formulário).');
  }

  saveXmlLocal(): void {
    this.xmlText = this.liveXml.serialize(true);
    localStorage.setItem('esocial.liveXml.draft', this.xmlText);
  }

  loadDraftIntoModal(): void {
    // tenta nova chave, senão tenta a antiga
    let raw = localStorage.getItem(this.getDraftKey());
    if (raw == null) raw = localStorage.getItem(this.getLegacyDraftKey());

    if (raw == null) {
      alert('Nenhum rascunho encontrado para este evento.');
      return;
    }
    this.xmlText = raw;
    this.revalidateXmlAndRequired();
    if (!this.xmlDlg?.nativeElement.open) this.xmlDlg?.nativeElement.showModal();
  }

  clearEventDrafts(): void {
    const prefix = 'esocial.event.draft:';
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }

    if (!toRemove.length) {
      alert('Nenhum rascunho de evento encontrado.');
      return;
    }
    const ok = confirm(`Remover ${toRemove.length} rascunho(s) de evento?`);
    if (!ok) return;

    toRemove.forEach(k => localStorage.removeItem(k));
    alert(`${toRemove.length} rascunho(s) removido(s).`);
  }

  loadXmlLocal(): void {
    const raw = localStorage.getItem('esocial.liveXml.draft');
    if (!raw) {
      console.warn('[rascunho] nada salvo em localStorage');
      return;
    }
    this.importExternalXmlIntoForm(raw);  // popula form + xml
    this.xmlText = this.liveXml.serialize(true);
    console.log(this.xmlText);
  }

  clearAllLocalDrafts(): void {
    const PREFIX = 'esocial.'; // ajuste se você usa outro prefixo
    // coleciona as chaves primeiro (para não bagunçar o iterator ao remover)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keysToRemove.push(k);
    }

    if (!keysToRemove.length) {
      alert('Nenhum rascunho encontrado.');
      return;
    }

    const ok = confirm(`Remover ${keysToRemove.length} rascunho(s) local(is)?`);
    if (!ok) return;

    keysToRemove.forEach(k => localStorage.removeItem(k));

    alert(`${keysToRemove.length} item(ns) removido(s) do armazenamento local.`);
  }

  private refreshXmlFromForm(): void {
    this.xmlText = this.liveXml.serialize(true);
  }

  private importExternalXmlIntoForm(xml: string): void {
    const r = this.root();
    if (!r) return;

    const snap = this.buildSnapshotFromXml(xml, r, this.eventName, 'eSocial');
    this.form.loadSnapshot(snap);

    this.liveXml.init('eSocial');
    this.liveXml.applySnapshot(this.eventName, snap, 'eSocial');


    this.refreshXmlFromForm();
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

    private buildSnapshotFromXml(
    xml: string,
    viewRoot: ViewNode,
    eventName: string,
    rootName = 'eSocial'
  ): {
    fields: Record<string, { type: 'text'|'number'|'date'|'enum', value: string }>,
    groupCounts: Record<string, number>,
    choices: Record<string, string>,
    choiceMeta: Record<string, { basePath: string; optionElementNames: string[]; chosenElementName: string }>
  } {
    const outFields: Record<string, {type:any, value:string}> = {};
    const outGroups: Record<string, number> = {};
    const outChoices: Record<string, string> = {};
    const choiceMeta: Record<string, {basePath:string; optionElementNames:string[]; chosenElementName:string}> = {};

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement;
    if (!root || root.tagName !== rootName) return { fields:{}, groupCounts:{}, choices:{}, choiceMeta:{} };
    const evt = Array.from(root.children).find(e => e.tagName === eventName) as Element | undefined;
    if (!evt) return { fields:{}, groupCounts:{}, choices:{}, choiceMeta:{} };

    const lc = (s?: string) => (s||'').toLowerCase();
    const firstElementNameDeep = (n: any): string | null => {
      if (!n) return null;
      if (lc(n.kind) === 'element' && n.name) return n.name;
      for (const c of (n.children || [])) {
        const r = firstElementNameDeep(c);
        if (r) return r;
      }
      return null;
    };
    const countIn = (relPath: string): number => {
      const parts = relPath.split('/').filter(Boolean);
      let cur: Element | null = evt!;
      for (let i=0;i<parts.length;i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2],10) : undefined;
        const list = Array.from(cur!.children).filter(e=>e.tagName===name) as Element[];
        if (i===parts.length-1 && idx==null) return list.length;
        cur = (idx==null) ? (list[0] ?? null) : (list[idx-1] ?? null);
        if (!cur) return 0;
      }
      return cur ? 1 : 0;
    };
    const textAt = (relPath: string): string | null => {
      const parts = relPath.split('/').filter(Boolean);
      let cur: Element | null = evt!;
      for (let i=0;i<parts.length;i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2],10) : 1;
        const list = Array.from(cur!.children).filter(e=>e.tagName===name) as Element[];
        cur = list[idx-1] ?? null;
        if (!cur) return null;
      }
      const t = (cur.textContent ?? '').trim();
      return t || null;
    };
    const attrAt = (relElementPath: string, attrName: string): string | null => {
      const parts = relElementPath.split('/').filter(Boolean);
      let cur: Element | null = evt!;
      for (let i=0;i<parts.length;i++) {
        const m = parts[i].match(/^(.+?)(?:\[(\d+)])?$/);
        const name = m?.[1] ?? parts[i];
        const idx  = m?.[2] ? parseInt(m![2],10) : 1;
        const list = Array.from(cur!.children).filter(e=>e.tagName===name) as Element[];
        cur = list[idx-1] ?? null;
        if (!cur) return null;
      }
      const v = cur.getAttribute(attrName);
      return (v ?? '').trim() || null;
    };
    const effBase = (n:any): 'text'|'number'|'date'|'enum' => {
      const base = lc(n?.meta?.base || n?.meta?.typeName || '');
      if (base.includes('date')) return 'date';
      if (n?.meta?.numericFacets) return 'number';
      if ((n?.children||[]).some((c:any) => lc(c.kind)==='enumeration')) return 'enum';
      return 'text';
    };

    const walk = (n:any, baseRel:string) => {
      if (!n) return;
      const k = lc(n.kind);

      if (k === 'choice') {
        const optionNames = (n.children || [])
          .map((c:any) => firstElementNameDeep(c))
          .filter(Boolean) as string[];

        let chosenName: string | null = null;
        let chosenChildId = '';
        for (const opt of (n.children || [])) {
          const nm = firstElementNameDeep(opt);
          if (!nm) continue;
          const probe = baseRel ? `${baseRel}/${nm}` : nm;
          if (countIn(probe) > 0) { chosenName = nm; chosenChildId = opt.id; break; }
        }
        const choiceKey = `${baseRel}::choice@${n.id}`;
        if (chosenName && chosenChildId) {
          outChoices[choiceKey] = chosenChildId;
          choiceMeta[choiceKey] = {
            basePath: baseRel,
            optionElementNames: Array.from(new Set(optionNames)),
            chosenElementName: chosenName
          };
        }
        const chosenNode = (n.children || []).find((c:any) => c.id === chosenChildId);
        if (chosenNode && chosenName) walk(chosenNode, baseRel);
        return;
      }

      if (k === 'attribute') {
        const v = attrAt(baseRel, n.name);
        if (v != null) outFields[`${baseRel}/@${n.name}`] = { type: 'text', value: v };
        return;
      }

      if (k === 'element') {
        const name = n.name;
        const baseNoIdx = baseRel ? `${baseRel}/${name}` : name;
        const cnt = countIn(baseNoIdx);

        const max = n.meta?.occurs?.max;
        const isRepeatable = max === 'unbounded' || (typeof max === 'number' && max > 1);
        if (isRepeatable) outGroups[baseNoIdx] = cnt;

        if ((n.children || []).length) {
          for (let i = 1; i <= Math.max(cnt, 0); i++) {
            for (const c of (n.children || [])) walk(c, `${baseNoIdx}[${i}]`);
          }
        } else {
          const t = effBase(n);
          for (let i = 1; i <= Math.max(cnt, 0); i++) {
            const p = `${baseNoIdx}[${i}]`;
            const v = textAt(p);
            if (v != null) outFields[p] = { type: t, value: v };
          }
        }
        return;
      }

      if ((n.children || []).length) for (const c of n.children) walk(c, baseRel);
    };

    walk(viewRoot, '');
    return { fields: outFields, groupCounts: outGroups, choices: outChoices, choiceMeta };
  }
}
