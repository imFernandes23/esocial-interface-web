const XS = "http://www.w3.org/2001/XMLSchema";

/** Pegar root do documento <xs:schema> (root) com segurança */
function getSchemaRoot(doc: Document): Element {
  const byNs = doc.getElementsByTagNameNS(XS, "schema")?.[0];
  if (byNs) return byNs;
  if(doc.documentElement?.localName === "schema") return doc.documentElement;
  throw new Error("Root <schema> não encontrado")
}

/** Extrai valor de atributo do root com fallback de string vazia */
function attr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name) ? el.getAttribute(name)! : undefined;
}

/** Converte NamedNodeMap de atributos em objeto simples */
function attributesToObject(el: Element): Record<string, string> {
  return Object.fromEntries(Array.from(el.attributes, a => [a.name, a.value]));
}

/** Helper para listar filhos imediatos por localName dentro do nameespace XSD */
function childrenByLocalName(parent: Element, local: string): Element[] {
  return Array.from(parent.children)
    .filter(ch => ch.namespaceURI === XS && ch.localName === local);
}

/** Extrai xs:annotation/xs:documentation (texto concatenado) de um nó */
function getDocumentation(el: Element): string | undefined {
  const ann = Array.from(el.children).find(c => c.namespaceURI === XS && c.localName === "annotation")
  if(!ann) return undefined;
  const docs = Array.from(ann.children).filter(c => c.namespaceURI === XS && c.localName === "documentation");
  const text = docs.map(d => d.textContent?.trim() ?? "").filter(Boolean).join("\n");
  return text || undefined;
}

/** Representações simples */
export interface XsdSchemaInfo {
  tagName: string;                     // ex.: 'xs:schema'
  attributes: Record<string,string>;   // todos atributos do root
  targetNamespace?: string;
  elementFormDefault?: string;
  attributeFormDefault?: string;
  version?: string;
  namespaces: Record<string,string>;   // prefixo -> URI (xmlns:*)
  includes: { schemaLocation?: string }[];
  imports:  { namespace?: string; schemaLocation?: string }[];
  redefines:{ schemaLocation?: string }[];
  simpleTypes: { name?: string; base?: string; documentation?: string }[];
  complexTypes:{ name?: string; documentation?: string }[];
  elements:   { name?: string; type?: string; ref?: string; minOccurs?: string; maxOccurs?: string; documentation?: string }[];
}

/** Extrai informações do root <schema> e filhos imediatos */
export function extractSchemaInfo(doc: Document): XsdSchemaInfo {
  const root = getSchemaRoot(doc);

  // Atributos e namespaces (xmlns, xmlns:xs, etc.)
  const attributes = attributesToObject(root);
  const namespaces: Record<string,string> = {};
  for (const [k,v] of Object.entries(attributes)) {
    if (k === "xmlns" || k.startsWith("xmlns:")) {
      const prefix = k === "xmlns" ? "" : k.substring("xmlns:".length);
      namespaces[prefix] = v;
    }
  }

  // includes/imports/redefines
  const includes  = childrenByLocalName(root, "include" ).map(el => ({ schemaLocation: attr(el,"schemaLocation") }));
  const imports   = childrenByLocalName(root, "import"  ).map(el => ({ namespace: attr(el,"namespace"), schemaLocation: attr(el,"schemaLocation") }));
  const redefines = childrenByLocalName(root, "redefine").map(el => ({ schemaLocation: attr(el,"schemaLocation") }));

  // simpleTypes (só nível global)
  const simpleTypes = childrenByLocalName(root, "simpleType").map(st => {
    const restriction = Array.from(st.children).find(c => c.namespaceURI === XS && c.localName === "restriction") as Element | undefined;
    const base = restriction?.getAttribute("base") ?? undefined;
    return {
      name: attr(st,"name"),
      base,
      documentation: getDocumentation(st),
    };
  });

  // complexTypes (global)
  const complexTypes = childrenByLocalName(root, "complexType").map(ct => ({
    name: attr(ct,"name"),
    documentation: getDocumentation(ct),
  }));

  // elements (globais)
  const elements = childrenByLocalName(root, "element").map(el => ({
    name: attr(el,"name"),
    type: attr(el,"type"),
    ref: attr(el,"ref"),
    minOccurs: attr(el,"minOccurs"),
    maxOccurs: attr(el,"maxOccurs"),
    documentation: getDocumentation(el),
  }));

  return {
    tagName: root.tagName, // costuma ser 'xs:schema'
    attributes,
    targetNamespace: attr(root,"targetNamespace"),
    elementFormDefault: attr(root,"elementFormDefault"),
    attributeFormDefault: attr(root,"attributeFormDefault"),
    version: attr(root,"version"),
    namespaces,
    includes,
    imports,
    redefines,
    simpleTypes,
    complexTypes,
    elements,
  };
}