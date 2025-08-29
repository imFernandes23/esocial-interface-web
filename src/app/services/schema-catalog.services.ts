import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { SchemaStoreService } from './schema-store.service';

export interface EventMeta {
  id: string;            // código S-xxxx, ou fallback do fileName
  title: string;         // rótulo amigável (label)
  fileName: string;      // chave no files (ex.: "evtRemun.xsd")
  description?: string;  // opcional
}

export interface SchemaCatalog {
  setId: string;
  version?: string;
  uploadedAt: string;
  events: EventMeta[];
}

type EsocialSchema = {
  id: string;
  createdAt: number;
  version?: string;
  files: Record<string, string>;
  events: Array<{ fileName: string; label: string; isTipos: boolean }>;
};

@Injectable({ providedIn: 'root' })
export class SchemaCatalogService {
  private store = inject(SchemaStoreService);
  private latestId$ = new BehaviorSubject<string | null>(this.pickLatestId());

  private pickLatestId(): string | null {
    const list = this.store.list();
    return list.length ? list[0].id : null;
  }
  refreshLatest() {
    this.latestId$.next(this.pickLatestId());
  }

  private extractEventCode(source?: string): string | null {
    if (!source) return null;
    const m = source.match(/S-\d{3,4}/i);
    return m ? m[0].toUpperCase() : null;
    // Se quiser, adicione outras heurísticas aqui.
  }

  catalog$ = this.latestId$.pipe(
    map(latestId => {
      if (!latestId) return null;
      const schema = this.store.get(latestId) as unknown as EsocialSchema | null;
      if (!schema) return null;

      const uploadedAtIso = new Date(schema.createdAt || Date.now()).toISOString();

      const events: EventMeta[] = (schema.events ?? [])
        .filter(e => !e.isTipos) // nunca listar tipos.xsd
        .map(e => {
          const code =
            this.extractEventCode(e.label) ||
            this.extractEventCode(e.fileName) ||
            e.fileName.replace(/\.xsd$/i, '');
          const title = e.label || `Evento ${code}`;
          return {
            id: code,
            title,
            description: e.label || undefined,
            fileName: e.fileName
          };
        });

      return {
        setId: schema.id,
        version: schema.version,
        uploadedAt: uploadedAtIso,
        events
      } as SchemaCatalog;
    })
  );

  upsertSchema(schema: EsocialSchema) {
    this.store.upsert(schema as any);
    this.refreshLatest();
  }
  removeSchema(id: string) {
    this.store.remove(id);
    this.refreshLatest();
  }
  getLatestSchema(): EsocialSchema | null {
    const latestId = this.pickLatestId();
    return latestId ? (this.store.get(latestId) as any as EsocialSchema) : null;
  }
}
