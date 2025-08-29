import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SchemaCatalogService } from '../../../services/schema-catalog.services';

@Component({
  selector: 'app-novo-evento-winzard',
  imports: [CommonModule],
  templateUrl: './novo-evento-winzard.component.html',
  styleUrl: './novo-evento-winzard.component.css'
})
export class NovoEventoWinzardComponent {
  private route = inject(ActivatedRoute);
  private catalog = inject(SchemaCatalogService);

  fileName = decodeURIComponent(this.route.snapshot.paramMap.get('fileName') || '');
  xml: string | null = null;

  constructor() {
    const latest = this.catalog.getLatestSchema();
    this.xml = latest?.files?.[this.fileName] ?? null;
  }
}
