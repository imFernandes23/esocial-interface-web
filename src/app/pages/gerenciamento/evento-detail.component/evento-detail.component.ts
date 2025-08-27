import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SchemaStoreService } from '../../../services/schema-store.service';
import { EsocialSchema, TreeNode, ViewNode } from '../../../shared/models/schema-models';
import { buildViewTree, SchemaTreeService } from '../../../services/schema-tree.service';
import { SchemaNode } from "../../../component/schema-node/schema-node";

const XS = 'http://www.w3.org/2001/XMLSchema';

@Component({
  selector: 'app-evento-detail.component',
  imports: [CommonModule, RouterModule, SchemaNode],
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

  rootOpen = true;;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private store: SchemaStoreService,
    private treeService: SchemaTreeService
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
      console.log(this.rootNode)
    } else {
      const DocTipos = this.schema?.files['tipos.xsd']
      const DocEvento = this.schema?.files[this.fileName]
      this.rootNode = this.treeService.buildEventoTree(String(DocEvento), String(DocTipos))
      console.log(this.rootNode)
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

  save(){
    // Próxima etapa: aplicar as mutações no XML do XSD e sobrescrever em store.
    alert('Salvar: (MVP 2) aqui vamos persistir as alterações no XSD no navegador.');
    console.log(this.schema)
  }
}

function firstChildNS(parent: Element, local: string): Element | null {
  for (const c of Array.from(parent.children)) {
    if (c.namespaceURI === XS && c.localName === local) return c as Element;
  }
  return null;
}
function qNameLocal(qname: string): string {
  // xs:string => string ; TS_Nome => TS_Nome
  const i = qname.indexOf(':');
  return i >= 0 ? qname.slice(i + 1) : qname;
}
