/**
 * Só para testes: um D1 em memória com o SQLite do Node (`node:sqlite`), com a mesma API que o
 * Worker usa (`prepare`/`bind`/`first`/`all`/`run`/`batch`). Aplica as migrações reais.
 */

interface InstrucaoNode {
  all(...p: unknown[]): Record<string, unknown>[];
  get(...p: unknown[]): Record<string, unknown> | undefined;
  run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface BaseNode {
  exec(sql: string): void;
  prepare(sql: string): InstrucaoNode;
}

// Sem tipos do Node no Worker: o módulo é carregado pelo nome em tempo de execução.
const modulo = "node:sqlite";
const { DatabaseSync } = (await import(/* @vite-ignore */ modulo)) as {
  DatabaseSync: new (caminho: string) => BaseNode;
};

class Instrucao {
  constructor(
    readonly base: BaseNode,
    readonly sql: string,
    readonly valores: unknown[] = [],
  ) {}
  bind(...valores: unknown[]): Instrucao {
    return new Instrucao(this.base, this.sql, valores);
  }
  async first<T>(coluna?: string): Promise<T | null> {
    const linha = this.base.prepare(this.sql).get(...this.valores);
    if (!linha) return null;
    return (coluna ? linha[coluna] : linha) as T;
  }
  async all<T>(): Promise<{ results: T[]; success: true }> {
    return { results: this.base.prepare(this.sql).all(...this.valores) as T[], success: true };
  }
  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    return { success: true, meta: this.executar() };
  }
  /** Para o batch: um SELECT devolve as linhas, como no D1. */
  resultado(): {
    success: true;
    results: unknown[];
    meta: { changes: number; last_row_id: number };
  } {
    if (/^\s*select/i.test(this.sql))
      return {
        success: true,
        results: this.base.prepare(this.sql).all(...this.valores),
        meta: { changes: 0, last_row_id: 0 },
      };
    return { success: true, results: [], meta: this.executar() };
  }
  executar(): { changes: number; last_row_id: number } {
    const r = this.base.prepare(this.sql).run(...this.valores);
    return { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) };
  }
}

export class D1Memoria {
  readonly base: BaseNode;
  constructor(migracoes: string[]) {
    this.base = new DatabaseSync(":memory:");
    for (const sql of migracoes) this.base.exec(sql);
  }
  prepare(sql: string): Instrucao {
    return new Instrucao(this.base, sql);
  }
  /** Como no D1: tudo numa transação; um erro anula o lote inteiro. */
  async batch(instrucoes: Instrucao[]): Promise<ReturnType<Instrucao["resultado"]>[]> {
    this.base.exec("BEGIN");
    try {
      const r = instrucoes.map((i) => i.resultado());
      this.base.exec("COMMIT");
      return r;
    } catch (e) {
      this.base.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql: string): Promise<void> {
    this.base.exec(sql);
  }
  comoD1(): D1Database {
    return this as unknown as D1Database;
  }
}
