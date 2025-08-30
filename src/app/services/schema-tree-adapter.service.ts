// src/app/services/schema-tree-adapter.service.ts
import { Injectable, inject } from '@angular/core';
import { SchemaCatalogService } from './schema-catalog.services';
import { SchemaTreeService } from './schema-tree.service';
import { TreeNode, ViewNode } from '../shared/models/schema-models';

type EsocialSchema = {
  id: string;
  createdAt: number;
  version?: string;
  files: Record<string, string>;
  events: Array<{ fileName: string; label: string; isTipos: boolean }>;
};

@Injectable({ providedIn: 'root' })
export class SchemaTreeAdapterService {
  private catalog = inject(SchemaCatalogService);
  private treeSvc = inject(SchemaTreeService);

  /**
   * Constrói a árvore de ViewNode a partir do conjunto mais recente,
   * usando o evento (fileName) + o tipos.xsd. Não altera docs/restrições.
   */
  buildViewTreeFromLatest(fileName: string): { code: string; title: string; root: ViewNode } {
    const schema = this.catalog.getLatestSchema() as EsocialSchema | null;
    if (!schema) throw new Error('Nenhum conjunto de schemas carregado.');

    const eventoXsd = schema.files?.[fileName];
    if (!eventoXsd) throw new Error(`XSD do evento não encontrado: ${fileName}`);

    const tiposFile =
      schema.events?.find(e => e.isTipos)?.fileName
      ?? Object.keys(schema.files || {}).find(n => /tipos\.xsd$/i.test(n))
      ?? Object.keys(schema.files || {}).find(n => /tipos/i.test(n));
    if (!tiposFile) throw new Error('Arquivo tipos.xsd não encontrado no conjunto.');
    const tiposXsd = schema.files[tiposFile];

    // 1) pega a árvore bruta do seu serviço
    const rawRoot: TreeNode = this.treeSvc.buildEventoTree(eventoXsd, tiposXsd);

    // 2) normaliza para ViewNode (sem modificar docs)
    const root = this.toView(rawRoot, new Set<string>());

    // 3) título
    const meta = schema.events?.find(e => e.fileName === fileName);
    const title = meta?.label || fileName;
    const code = (title.match(/S-\d{3,4}/i)?.[0] || fileName.match(/S-\d{3,4}/i)?.[0] || '—').toUpperCase();

    return { code, title, root };
  }

  // ---- conversor 1:1 com proteção contra ciclos por id ----
  private toView(node: TreeNode, seen: Set<string>): ViewNode {
    const id = node.id || `${node.kind}:${node.name}:${seen.size}`;
    if (seen.has(id)) {
      // corta para evitar loop, mantendo o nó atual sem filhos
      return { id, name: node.name, kind: node.kind, meta: node.meta, source: node, children: [] };
    }
    seen.add(id);

    const children = (node.children || []).map(ch => this.toView(ch, seen));
    return {
      id,
      name: node.name,
      kind: node.kind,
      meta: node.meta,
      source: node,
      children
    };
  }
}