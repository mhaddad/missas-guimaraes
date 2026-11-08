/**
 * Lógica da página pública (§6.2–6.6), sem DOM: usada no build (HTML estático) e no navegador
 * (ilha `scripts/portal.ts`). Todas as datas e horas são de Lisboa.
 */
import {
  diaDaSemana,
  expandir,
  somarDias,
  type CalendarioMotor,
  type Data,
  type DiaSanto,
  type Entidade,
  type Local,
  type Ocorrencia,
  type TipoCelebracao,
} from "@missas/horarios";

/** Local tal como vai para o navegador: só o que a página precisa. */
export interface LocalPortal extends Pick<
  Local,
  | "id"
  | "nome"
  | "localidade"
  | "freguesia"
  | "concelho"
  | "orago"
  | "morada"
  | "geo"
  | "dias_santos"
  | "horarios"
  | "excecoes"
  | "notas"
  | "notas_i18n"
  | "confirmado_em"
> {
  entidade: { id: string; nome: string; tipo: Entidade["tipo"]; telefones: string[] };
  /** Texto normalizado para a pesquisa (nome, localidade, freguesia, orago, entidade). */
  pesquisa: string;
}

export interface DadosPortal {
  locais: LocalPortal[];
  /** Regras dos dias santos (de `dados/calendario.yml`). */
  calendario: import("@missas/horarios").Calendario;
  /** Momento do build, em ISO (UTC). */
  geradoEm: string;
}

/** Sem acentos nem maiúsculas: "São Dâmaso" → "sao damaso". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function textoPesquisa(local: Local, entidade: Pick<Entidade, "nome">): string {
  return normalizar(
    [local.nome, local.localidade, local.freguesia, local.orago, entidade.nome, local.concelho]
      .filter(Boolean)
      .join(" "),
  );
}

export function correspondePesquisa(
  local: Pick<LocalPortal, "pesquisa">,
  consulta: string,
): boolean {
  const termos = normalizar(consulta).split(" ").filter(Boolean);
  return termos.every((t) => local.pesquisa.includes(t));
}

// ---------------------------------------------------------------------------------------------
// Estado da página na query string (§6.2): /?dia=amanha&concelho=vizela&q=penha&vista=igreja

export type EscolhaDia = "hoje" | "amanha" | "domingo" | Data;
export type Concelho = "todos" | "guimaraes" | "vizela";
export type Vista = "hora" | "igreja";

export interface Estado {
  dia: EscolhaDia;
  concelho: Concelho;
  q: string;
  vista: Vista;
  tipo: TipoCelebracao | null;
}

export const ESTADO_INICIAL: Estado = {
  dia: "hoje",
  concelho: "todos",
  q: "",
  vista: "hora",
  tipo: null,
};

const TIPOS: readonly TipoCelebracao[] = ["missa", "confissoes", "adoracao", "terco", "outro"];

export function lerEstado(pesquisa: string): Estado {
  const p = new URLSearchParams(pesquisa);
  const dia = p.get("dia");
  const concelho = p.get("concelho");
  const tipo = p.get("tipo");
  return {
    dia:
      dia === "amanha" || dia === "domingo" || (dia !== null && /^\d{4}-\d{2}-\d{2}$/.test(dia))
        ? dia
        : "hoje",
    concelho: concelho === "guimaraes" || concelho === "vizela" ? concelho : "todos",
    q: (p.get("q") ?? "").slice(0, 100),
    vista: p.get("vista") === "igreja" ? "igreja" : "hora",
    tipo: TIPOS.includes(tipo as TipoCelebracao) ? (tipo as TipoCelebracao) : null,
  };
}

/** Query string do estado, só com o que difere do inicial ("" se nada). */
export function escreverEstado(estado: Estado): string {
  const p = new URLSearchParams();
  if (estado.dia !== "hoje") p.set("dia", estado.dia);
  if (estado.concelho !== "todos") p.set("concelho", estado.concelho);
  if (estado.q.trim()) p.set("q", estado.q.trim());
  if (estado.vista !== "hora") p.set("vista", estado.vista);
  if (estado.tipo) p.set("tipo", estado.tipo);
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

/** Data concreta da escolha: hoje, amanhã, o próximo domingo (nunca hoje) ou uma data. */
export function dataDaEscolha(escolha: EscolhaDia, hoje: Data): Data {
  if (escolha === "hoje") return hoje;
  if (escolha === "amanha") return somarDias(hoje, 1);
  if (escolha === "domingo") {
    let d = somarDias(hoje, 1);
    while (diaDaSemana(d) !== "dom") d = somarDias(d, 1);
    return d;
  }
  return escolha;
}

// ---------------------------------------------------------------------------------------------
// Selo de confirmação (§6.6), calculado no navegador para continuar certo sem novo build.

export type EstadoSelo = "confirmadoHoje" | "confirmado" | "aConfirmar" | "antigo" | "importado";

export function selo(
  confirmadoEm: string | null,
  hoje: Data,
): { estado: EstadoSelo; dias: number } {
  if (confirmadoEm === null) return { estado: "importado", dias: -1 };
  const dias = Math.max(0, Math.round((Date.parse(hoje) - Date.parse(confirmadoEm)) / 86_400_000));
  if (dias === 0) return { estado: "confirmadoHoje", dias };
  if (dias <= 45) return { estado: "confirmado", dias };
  if (dias <= 120) return { estado: "aConfirmar", dias };
  return { estado: "antigo", dias };
}

// ---------------------------------------------------------------------------------------------
// Celebrações de um dia

export type Periodo = "manha" | "tarde" | "noite";

export function periodo(hora: string): Periodo {
  if (hora < "12:00") return "manha";
  if (hora < "19:00") return "tarde";
  return "noite";
}

export function filtrarLocais(
  locais: readonly LocalPortal[],
  estado: Pick<Estado, "concelho" | "q">,
): LocalPortal[] {
  return locais.filter(
    (l) =>
      (estado.concelho === "todos" ||
        (estado.concelho === "vizela") === (l.concelho === "Vizela")) &&
      correspondePesquisa(l, estado.q),
  );
}

export interface CelebracaoPortal extends Ocorrencia {
  /** Missa vespertina de sábado mostrada na escolha "Próx. domingo". */
  vespera?: boolean;
  /** Confissões no mesmo local e dia (horas), para a etiqueta. */
  confissoesAs?: string[];
}

export interface DiaPortal {
  data: Data;
  diaSanto: DiaSanto | undefined;
  celebracoes: CelebracaoPortal[];
  /** Celebrações de locais sem informação sobre os dias santos (bloco à parte, §6.4). */
  semInformacao: CelebracaoPortal[];
}

/** Missa a partir das 16:00 de sábado: conta para o domingo (vespertina). */
function eVespertina(o: Ocorrencia): boolean {
  return o.tipo === "missa" && o.hora >= "16:00";
}

export function celebracoesDoDia(
  locais: readonly LocalPortal[],
  escolha: EscolhaDia,
  hoje: Data,
  calendario: CalendarioMotor,
  tipo: TipoCelebracao | null = null,
): DiaPortal {
  const data = dataDaEscolha(escolha, hoje);
  const diaSanto = diaDaSemana(data) === "dom" ? undefined : calendario.diaSanto(data);
  const celebracoes: CelebracaoPortal[] = [];
  const semInformacao: CelebracaoPortal[] = [];
  const incluirVespera = escolha === "domingo";

  for (const local of locais) {
    const doDia = expandir(local as unknown as Local, data, data, { calendario });
    const confissoes = doDia.ocorrencias.filter((o) => o.tipo === "confissoes").map((o) => o.hora);
    const lista: CelebracaoPortal[] = doDia.ocorrencias.map((o) =>
      o.tipo !== "confissoes" && confissoes.length ? { ...o, confissoesAs: confissoes } : o,
    );
    if (incluirVespera) {
      const sabado = somarDias(data, -1);
      for (const o of expandir(local as unknown as Local, sabado, sabado, { calendario })
        .ocorrencias) {
        if (eVespertina(o)) lista.push({ ...o, vespera: true });
      }
    }
    const filtrada = tipo ? lista.filter((o) => o.tipo === tipo) : lista;
    if (doDia.avisos.length > 0) semInformacao.push(...filtrada);
    else celebracoes.push(...filtrada);
  }

  const ordem = (a: CelebracaoPortal, b: CelebracaoPortal) =>
    a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora) || a.local.localeCompare(b.local);
  return {
    data,
    diaSanto,
    celebracoes: celebracoes.sort(ordem),
    semInformacao: semInformacao.sort(ordem),
  };
}

/** Minutos de `agora` (data e hora de Lisboa) até à celebração; negativo se já passou. */
export function minutosAte(
  agora: { data: Data; hora: string },
  o: Pick<Ocorrencia, "data" | "hora">,
): number {
  const dias = Math.round((Date.parse(o.data) - Date.parse(agora.data)) / 86_400_000);
  const [h1, m1] = agora.hora.split(":").map(Number) as [number, number];
  const [h2, m2] = o.hora.split(":").map(Number) as [number, number];
  return dias * 1440 + (h2 * 60 + m2) - (h1 * 60 + m1);
}

/** Ligação para a aplicação de mapas com as coordenadas (§6.5). */
export function ligacaoMapa(geo: { lat: number; lon: number }, apple = false): string {
  const destino = `${geo.lat},${geo.lon}`;
  return apple
    ? `https://maps.apple.com/?daddr=${destino}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}

/** Próximos dias santos e datas móveis a partir de `hoje` (atalho *Solenidades*). */
export function proximasSolenidades(
  calendario: DadosPortal["calendario"],
  hoje: Data,
  limite = 8,
): { data: Data; id: string; nome?: string; preceito: boolean }[] {
  const lista: { data: Data; id: string; nome?: string; preceito: boolean }[] = [];
  for (const ano of Object.values(calendario.anos)) {
    if (!ano) continue;
    for (const [id, data] of Object.entries(ano.dias_santos)) {
      if (!data) continue;
      const regra = calendario.dias_santos_de_preceito.regras.find((r) => r.id === id);
      lista.push({ data, id, ...(regra && { nome: regra.nome }), preceito: true });
    }
    for (const [id, data] of Object.entries(ano.moveis)) {
      if (data) lista.push({ data, id, preceito: false });
    }
  }
  return lista
    .filter((s) => s.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || Number(b.preceito) - Number(a.preceito))
    .slice(0, limite);
}
