import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SchemaStoreService } from '../../../services/schema-store.service';
import { EsocialSchema, TreeNode, ViewNode } from '../../../shared/models/schema-models';
import { buildViewTree, SchemaTreeService } from '../../../services/schema-tree.service';
import { SchemaNode } from "../../../component/schema-node/schema-node";
import { EditBufferService } from '../../../services/edit-buffer.service';
import { XsdMutationService } from '../../../services/xsd-mutation.service';
import { ModalComponent } from '../../../component/modal.component/modal.component';

const XS = 'http://www.w3.org/2001/XMLSchema';

@Component({
  selector: 'app-evento-detail.component',
  imports: [CommonModule, RouterModule, SchemaNode, ModalComponent],
  templateUrl: './evento-detail.component.html',
  styleUrl: './evento-detail.component.css'
})
export class EventoDetailComponent {
  schema: EsocialSchema | null = null;
  label = '';
  title = '';
  fileName = '';
  rootNode: TreeNode | null = null;
  viewRoot: ViewNode | null = null;

  showConfirm = false;
  reportLines: string[] = [];
  previewEvento = '';
  previewTipos = '';
  applyDisabled = false;

  rootOpen = true;;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private store: SchemaStoreService,
    private treeService: SchemaTreeService,
    private edits: EditBufferService,
    private mut: XsdMutationService
  ) {
    const schemaId = this.route.snapshot.paramMap.get('schemaId')!;
    this.fileName = this.route.snapshot.paramMap.get('fileName')!;
    this.schema = this.store.get(schemaId);
    const ev = this.schema?.events.find(e => e.fileName === this.fileName);
    this.label = ev?.isTipos ? 'tipos' : (ev?.label || this.fileName);
    this.title = this.label;

    if (this.fileName === 'tipos.xsd'){
      console.log(this.schema)
      const DocTipos = this.schema?.files[this.fileName]
      this.rootNode = this.treeService.buildTiposTree( String(DocTipos) )
    } else {
      const DocTipos = this.schema?.files['tipos.xsd']
      const DocEvento = this.schema?.files[this.fileName]
      this.rootNode = this.treeService.buildEventoTree(String(DocEvento), String(DocTipos))
    }

    if (this.rootNode) {
      // se seu root é "schema", mostre todos os filhos dele como 1º nível
      const rootToShow = this.rootNode.kind === 'schema' && this.rootNode.children?.length
        ? { ...this.rootNode, children: this.rootNode.children } // mesmo root
        : this.rootNode;

      this.viewRoot = buildViewTree(rootToShow);
    }
  }

    /** filhos de primeiro nível a renderizar no root visual */
  get topLevelViewNodes(): ViewNode[] {
    if (!this.viewRoot) return [];
    // se o root é "schema", mostre todos os filhos dele
    return this.viewRoot.children ?? [this.viewRoot];
  }

  trackNode = (_: number, n: TreeNode) => n.id;

  toggleRoot(ev?: Event) {
    ev?.stopPropagation(); // impede click dentro do body fechar o root
    this.rootOpen = !this.rootOpen;
  }


  goBack(){ history.length > 1 ? history.back() : this.router.navigate(['/gerenciamento']); }

  openConfirm() {
    if (!this.schema) return;
    const files = this.schema.files || {};
    const eventoXml = files[this.fileName] || '';
    const tiposKey = Object.keys(files).find(k => /^tipos.*\.xsd$/i.test(k)) || 'tipos.xsd';
    const tiposXml  = files[tiposKey] || '';

    const res = this.mut.applyEnumRemovals(eventoXml, tiposXml, this.edits.snapshot());
    this.reportLines = res.report;
    this.previewEvento = res.eventoXml;
    this.previewTipos = res.tiposXml;
    this.showConfirm = true;
    this.applyDisabled = res.changes === 0;
  }

  confirmApply() {
    if (!this.schema) return;
    const files = { ...this.schema.files };

    // usa os previews já prontos
    const tiposKey = Object.keys(files).find(k => /^tipos.*\.xsd$/i.test(k)) || 'tipos.xsd';
    files[this.fileName] = this.previewEvento || files[this.fileName];
    files[tiposKey]      = this.previewTipos  || files[tiposKey];

    const updated = { ...this.schema, files };
    this.store.upsert(updated);

    this.edits.clear();
    this.showConfirm = false;

    //reload trees
  const fresh = this.store.get(updated.id);
  if (fresh) {
    this.schema = fresh;
    if (this.fileName === 'tipos.xsd'){
      console.log(this.schema)
      const DocTipos = this.schema?.files[this.fileName]
      this.rootNode = this.treeService.buildTiposTree( String(DocTipos) )
    } else {
      const DocTipos = this.schema?.files['tipos.xsd']
      const DocEvento = this.schema?.files[this.fileName]
      this.rootNode = this.treeService.buildEventoTree(String(DocEvento), String(DocTipos))
    }

    if (this.rootNode) {
      const rootToShow = this.rootNode.kind === 'schema' && this.rootNode.children?.length
        ? { ...this.rootNode, children: this.rootNode.children } // mesmo root
        : this.rootNode;

      this.viewRoot = buildViewTree(rootToShow);
    }
  }
    alert('Alterações aplicadas com sucesso!');
    
  }
}


