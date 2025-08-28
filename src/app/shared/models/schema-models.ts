export interface EsocialSchema {
  id: string;               // ex: "v1_03_00"
  createdAt: number;
  files: Record<string,string>; // nome.xsd -> conteúdo (xml string)
  // índice calculado:
  events: Array<{ fileName: string; label: string; isTipos: boolean }>;
}

export type LoadSource = 'zip' | 'local';

export interface OccursMeta {
  min: number;
  max: number | 'unbounded'
}

export interface TreeNode {
  id: string;
  name: string;      // o que exibimos na UI
  kind: string;      // schema, element, complexType, simpleType, sequence, choice, attribute, enum...
  children?: TreeNode[];
  meta?: {
    typeName?: string;
    base?: string;
    use?: 'required'|'optional'|'prohibited'|string;
    docs?: string[];
    occurs?: OccursMeta;
  }
}

export interface ViewNode {
  id: string;
  name: string;
  kind: string;
  children?: ViewNode[];
  source: TreeNode;
  meta?: {   
    typeName?: string;
    base?: string;
    use?: 'required'|'optional'|'prohibited'|string;
    docs?: string[];
    occurs?: OccursMeta;
  };
}