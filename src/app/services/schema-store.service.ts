import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SchemaStoreService {
  private KEY = 'esocial.schemas.v1';

  list(): { id: string; createdAt: number }[] {
    const all = this.loadAll();
    return all.map(s => ({ id: s.id, createdAt: s.createdAt })).sort((a,b)=>b.createdAt-a.createdAt);
  }
  get(id: string): import('../shared/models/schema-models').EsocialSchema | null {
    return this.loadAll().find(s => s.id === id) || null;
  }
  upsert(schema: import('../shared/models/schema-models').EsocialSchema) {
    const all = this.loadAll().filter(s => s.id !== schema.id);
    all.push(schema);
    this.saveAll(all);
  }
  remove(id: string) {
    const all = this.loadAll().filter(s => s.id !== id);
    this.saveAll(all);
  }

  private loadAll(): import('../shared/models/schema-models').EsocialSchema[] {
    try {
      const raw = localStorage.getItem(this.KEY);
      
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  private saveAll(s: import('../shared/models/schema-models').EsocialSchema[]) {
    localStorage.setItem(this.KEY, JSON.stringify(s));
  }

}
