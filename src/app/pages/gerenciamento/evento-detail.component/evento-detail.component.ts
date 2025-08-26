import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SchemaStoreService } from '../../../services/schema-store.service';
import { EsocialSchema } from '../../../shared/models/schema-models';

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

  private open = new Set<string>();

  constructor(private route: ActivatedRoute, private router: Router, private store: SchemaStoreService) {
    const schemaId = this.route.snapshot.paramMap.get('schemaId')!;
    this.fileName = this.route.snapshot.paramMap.get('fileName')!;
    this.schema = this.store.get(schemaId);
    const ev = this.schema?.events.find(e => e.fileName === this.fileName);
    this.label = ev?.isTipos ? 'tipos' : (ev?.label || this.fileName);
    this.title = this.label;
  }

  toggle(key: string){ this.open.has(key) ? this.open.delete(key) : this.open.add(key); }
  isOpen(key: string){ return this.open.has(key); }

  goBack(){ history.length > 1 ? history.back() : this.router.navigate(['/gerenciamento']); }

  save(){
    // Próxima etapa: aplicar as mutações no XML do XSD e sobrescrever em store.
    alert('Salvar: (MVP 2) aqui vamos persistir as alterações no XSD no navegador.');
  }
}
