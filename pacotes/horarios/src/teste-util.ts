/** Utilitários só para testes. */
import type { Calendario, Local, Regra } from "./modelo.gerado.ts";

export function criarLocal(id: string, horarios: Regra[], extra: Partial<Local> = {}): Local {
  return {
    id,
    tipo: "igreja",
    entidade: id,
    concelho: "Guimarães",
    nome: `Igreja de ${id}`,
    geo: { lat: 41.44, lon: -8.29 },
    publicar: true,
    dias_santos: null,
    horarios,
    excecoes: [],
    notas: [],
    confirmado_em: null,
    confirmado_por: null,
    revisao: { pendente: false, motivos: [] },
    ...extra,
  };
}

/** Cópia das regras de `dados/calendario.yml` (os dias santos de cada ano são calculados). */
export const calendarioDeTeste: Calendario = {
  dias_santos_de_preceito: {
    estado: "documentado",
    regras: [
      { id: "santa-maria-mae-de-deus", nome: "Santa Maria, Mãe de Deus", data: "01-01" },
      { id: "corpo-de-deus", nome: "Corpo de Deus", data_movel: "pascoa+60" },
      { id: "assuncao", nome: "Assunção de Nossa Senhora", data: "08-15" },
      { id: "todos-os-santos", nome: "Todos os Santos", data: "11-01" },
      { id: "imaculada-conceicao", nome: "Imaculada Conceição", data: "12-08" },
      { id: "natal", nome: "Natal do Senhor", data: "12-25" },
    ],
  },
  anos: {},
};
