import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { EsocialSchema } from '../../../shared/models/schema-models';
import { XsdIndexerService } from '../../../services/xsd-indexer.service';
import JSZip from 'jszip';
import { SchemaStoreService } from '../../../services/schema-store.service';

@Component({
  selector: 'app-gerenciamento.component',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './gerenciamento.component.html',
  styleUrl: './gerenciamento.component.css'
})
export class GerenciamentoComponent implements OnInit{
  saved:  { id: string; createdAt: number }[] = []
  selectedId: string | null = null;
  schema: EsocialSchema | null = null;

  private indexer = new XsdIndexerService();
  constructor(private store: SchemaStoreService, private router: Router) {}
  
  ngOnInit(): void {
    this.saved = this.store.list();
  }

  async onZip(ev: Event){
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    const zip = await JSZip.loadAsync(file);
    const files: Record<string,string> = {};
    for (const entry of Object.values(zip.files)) {
      if (entry.name.toLowerCase().endsWith('.xsd')) {
        files[entry.name.split('/').pop()!] = await (entry as any).async('string');
      }
    }
    // gera um id simples (ex.: nome-do-zip + timestamp)
    const id = (file.name || 'esocial').replace(/\\.zip$/i,'') + '-' + Date.now();
    const events = this.indexer.buildEvents(files);
    this.schema = { id, createdAt: Date.now(), files, events };
    this.store.upsert(this.schema);
    this.saved = this.store.list();
    this.selectedId = this.schema.id;
  }

  loadSelected(){
    if (!this.selectedId) return;
    this.schema = this.store.get(this.selectedId);
  }

  onAddXsd(ev: Event){
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f || !this.schema) return;
    const reader = new FileReader();
    reader.onload = () => {
      const xml = String(reader.result || '');
      const name = f.name;
      this.schema!.files[name] = xml;
      this.schema!.events = this.indexer.buildEvents(this.schema!.files);
      this.store.upsert(this.schema!);
    };
    reader.readAsText(f);
  }

  deleteEvent(fileName: string){
    if (!this.schema) return;
    if (fileName.toLowerCase().includes('tipos')) return; // bloqueia tipos
    delete this.schema.files[fileName];
    this.schema.events = this.indexer.buildEvents(this.schema.files);
    this.store.upsert(this.schema);
  }

  removeSchema(){
    if (!this.schema) return;
    this.store.remove(this.schema.id);
    this.schema = null;
    this.saved = this.store.list();
    this.selectedId = null;
  }

  openEvent(fileName: string){
    if (!this.schema) return;
    this.router.navigate(['/gerenciamento', this.schema.id, 'evento', fileName]);
  }

}
