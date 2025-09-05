import { Injectable, signal } from '@angular/core';

// Tipos básicos dos campos
type ValueType = 'text' | 'number' | 'date' | 'enum';

interface FieldEntry {
  type: ValueType;
  value: string;
}

interface ChoiceMeta {
  /** Caminho base (visual) do pai do <choice> — pode conter [n] */
  basePath: string;
  /** Lista com os nomes dos elementos-ramo do choice */
  optionElementNames: string[];
  /** Nome do elemento atualmente escolhido */
  chosenElementName: string;
}

@Injectable({ providedIn: 'root' })
export class DynamicFormStateService {
  // -------------------------
  // Estado principal
  // -------------------------
  /** Mapa de valores de campos (chave = visualPath, ex.: "eSocial/S-1000/ideEvento[1]/tpAmb[1]") */
  private fields = signal<Record<string, FieldEntry>>({});

  /** Mapa de escolhas de <choice> (chave = `${vPrefix}::choice@${node.id}`) */
  private choices = signal<Record<string, string>>({});

  /** Mapa de contagem de grupos repetíveis (chave = base path sem [n] ao final, ex.: ".../dependente") */
  private groupCounts = signal<Record<string, number>>({});

  /** Metadados do choice para permitir poda dos ramos e reconstrução de XML */
  private choiceMeta = signal<Record<string, ChoiceMeta>>({});

  // -------------------------
  // Helpers de normalização/chaves
  // -------------------------
  /** Normaliza caminho para comparação: força "/" inicial e remove todos os [n] */
  private normStrict(s: string): string {
    return ('/' + (s || '').replace(/^\/+/, '')).trim();
  }

  // Remove apenas o prefixo "eSocial/" da comparação de sufixo (se existir).
  private stripRoot(p: string): string {
    const s = this.normStrict(p);
    return s.replace(/^\/eSocial\//i, '/'); // preserva [n]!
  }

  private resolveKey<T extends object>(map: T, vPath: string): string | undefined {
    if (!vPath) return undefined;
    if ((map as any)[vPath] !== undefined) return vPath;

    const want = this.stripRoot(vPath);
    for (const k of Object.keys(map as any)) {
      const have = this.stripRoot(k);
      if (have.endsWith(want)) return k;
    }
    return undefined;
  }

  // -------------------------
  // Fields (text/number/date/enum)
  // -------------------------
  registerField(vPath: string, type: ValueType, initial = ''): void {
    if (!vPath) return;
    const cur = this.fields();
    if (cur[vPath]) return; // não sobrescreve registro existente
    this.fields.set({ ...cur, [vPath]: { type, value: initial ?? '' } });
  }

  /** Setter genérico de valor + tipo (tipo default 'text' se já não houver) */
  setValue(vPath: string, value: string, type?: ValueType): void {
    if (!vPath) return;
    this.fields.update(map => {
      const cur = map[vPath];
      const t = type ?? cur?.type ?? 'text';
      return { ...map, [vPath]: { type: t, value: value ?? '' } };
    });
  }

  /** Getter genérico de valor de campo */
  getValue(vPath: string): string {
    const map = this.fields();
    const key = this.resolveKey(map, vPath) ?? vPath;
    return map[key]?.value ?? '';
  }

  /** Getter do tipo do campo */
  getType(vPath: string): ValueType | undefined {
    const map = this.fields();
    const key = this.resolveKey(map, vPath) ?? vPath;
    return map[key]?.type;
  }

  // Conveniências por tipo (mantêm compatibilidade com seu código existente)
  getText(vPath: string) { return this.getValue(vPath); }
  setText(vPath: string, v: string) { this.setValue(vPath, v, 'text'); }

  getEnum(vPath: string) { return this.getValue(vPath); }
  setEnum(vPath: string, v: string) { this.setValue(vPath, v, 'enum'); }

  setNumber(vPath: string, v: string) { this.setValue(vPath, v, 'number'); }
  setDate(vPath: string, v: string)   { this.setValue(vPath, v, 'date');   }

  /** Remove exatamente um caminho (se existir) */
  clearByPath(vPath: string): void {
    if (!vPath) return;
    const { [vPath]: _, ...rest } = this.fields();
    this.fields.set(rest);
  }

  /**
   * Remove todos os campos cujo path comece com `prefix` (útil para
   * podar um ramo quando troca o choice ou remove uma instância).
   */
  clearByPrefix(prefix: string): void {
    if (!prefix) return;
    const cur = this.fields();
    const next: Record<string, FieldEntry> = {};
    const want = prefix.endsWith('/') ? prefix : prefix + '/';
    for (const k of Object.keys(cur)) {
      if (k === prefix || k.startsWith(want)) continue;
      next[k] = cur[k];
    }
    this.fields.set(next);
  }

  // -------------------------
  // Choice
  // -------------------------
  /** Lê a escolha atual usando resolução de chave (ignora [n]) */
  getChoice(choiceKey: string): string | undefined {
    const map = this.choices();
    const key = this.resolveKey(map, choiceKey) ?? choiceKey;
    return map[key];
  }

  /**
   * Define a escolha de um <choice>.
   * `choiceKey` = `${vPrefix}::choice@${node.id}`
   * `opts` guarda meta pra podar ramos e reconstruir XML depois.
   */
  setChoice(
    choiceKey: string,
    childId: string,
    opts?: { basePath?: string; optionElementNames?: string[]; chosenElementName?: string }
  ): void {
    // Atualiza escolha (resolvendo chave existente se necessário)
    this.choices.update(m => {
      const key = this.resolveKey(m, choiceKey) ?? choiceKey;
      return { ...m, [key]: childId };
    });

    // Atualiza meta
    if (opts) {
      this.choiceMeta.update(m => {
        const key = this.resolveKey(m, choiceKey) ?? choiceKey;
        return {
          ...m,
          [key]: {
            basePath: opts.basePath ?? '',
            optionElementNames: opts.optionElementNames ?? [],
            chosenElementName: opts.chosenElementName ?? ''
          }
        };
      });
    }

    // Poda ramos NÃO escolhidos no próprio formulário
    const base = opts?.basePath ?? '';
    const names = opts?.optionElementNames ?? [];
    const keep  = opts?.chosenElementName ?? '';
    if (base && names.length) {
      for (const name of names) {
        if (name === keep) continue;
        const branch = base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
        this.clearByPrefix(branch);
      }
    }
  }

  /** Limpa a escolha (e os metadados associados) */
  clearChoice(choiceKey: string): void {
    // choices
    const curChoices = this.choices();
    const key = this.resolveKey(curChoices, choiceKey) ?? choiceKey;
    const { [key]: _, ...rest } = curChoices;
    this.choices.set(rest);

    // choiceMeta
    const curMeta = this.choiceMeta();
    const mkey = this.resolveKey(curMeta, choiceKey) ?? choiceKey;
    const { [mkey]: __, ...restMeta } = curMeta;
    this.choiceMeta.set(restMeta);
  }

  // -------------------------
  // Grupos repetíveis (arrays)
  // -------------------------
  /**
   * Lê a quantidade configurada para um basePath (ex.: "/evt/.../dependente")
   * Ignora [n] na resolução da chave.
   */
  getGroupCount(basePath: string): number {
    const map = this.groupCounts();
    const key = this.resolveKey(map, basePath) ?? basePath;
    return map[key] ?? 0;
    }

  /** Define quantidade; se diminuir, limpa valores "a mais" do último para trás */
  setGroupCount(basePath: string, count: number): void {
    if (!basePath) return;
    count = Math.max(0, count | 0);
    const cur = this.getGroupCount(basePath);

    // Se reduzir, limpa os sufixos das instâncias removidas
    for (let i = cur; i > count; i--) {
      this.clearByPrefix(`${basePath}[${i}]`);
    }
    this.groupCounts.update(m => ({ ...m, [basePath]: count }));
  }

  /** Adiciona 1 instância no final e retorna o índice (1-based) */
  addGroup(basePath: string): number {
    const n = this.getGroupCount(basePath) + 1;
    this.setGroupCount(basePath, n);
    return n;
  }

  /** Remove a última instância e limpa seus valores */
  removeGroup(basePath: string): void {
    const cur = this.getGroupCount(basePath);
    if (cur <= 0) return;
    this.clearByPrefix(`${basePath}[${cur}]`);
    this.groupCounts.update(m => ({ ...m, [basePath]: cur - 1 }));
  }

  // -------------------------
  // Snapshot / Reset / Load
  // -------------------------
  /** Flat snapshot para integrar com o LiveXmlService */
  snapshot() {
    return {
      fields: this.fields(),
      choices: this.choices(),
      groupCounts: this.groupCounts(),
      choiceMeta: this.choiceMeta()
    };
  }

  /** Alias semântico */
  asJson() { return this.snapshot(); }

  /** Zera tudo */
  resetAll(): void {
    this.fields.set({});
    this.choices.set({});
    this.groupCounts.set({});
    this.choiceMeta.set({});
  }

  /** Carrega estado inteiro a partir de um snapshot */
  loadSnapshot(snap: {
    fields: Record<string, { type: ValueType; value: string }>;
    choices: Record<string, string>;
    groupCounts: Record<string, number>;
    choiceMeta?: Record<string, ChoiceMeta>;
  }) {
    this.fields.set({ ...(snap.fields ?? {}) });
    this.choices.set({ ...(snap.choices ?? {}) });
    this.groupCounts.set({ ...(snap.groupCounts ?? {}) });
    this.choiceMeta.set({ ...(snap.choiceMeta ?? {}) });
  }
}
