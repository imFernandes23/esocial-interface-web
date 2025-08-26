import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SchemaStoreService } from '../../../services/schema-store.service';
import { EsocialSchema, TreeNode } from '../../../shared/models/schema-models';
import { SchemaTreeService } from '../../../services/schema-tree.service';

const XS = 'http://www.w3.org/2001/XMLSchema';

@Component({
  selector: 'app-evento-detail.component',
  imports: [CommonModule, RouterModule],
  templateUrl: './evento-detail.component.html',
  styleUrl: './evento-detail.component.css'
})
export class EventoDetailComponent {
  schema: EsocialSchema | null = null;
  label = '';
  title = '';
  fileName = '';
  rootNode: TreeNode | null = null;

  private open = new Set<string>();

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
  }



  toggle(key: string){ this.open.has(key) ? this.open.delete(key) : this.open.add(key); }
  isOpen(key: string){ return this.open.has(key); }

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
