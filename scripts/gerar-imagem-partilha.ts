/**
 * Gera a imagem de partilha (`og:image`, 1200×630) a partir do logótipo horizontal do
 * Arciprestado (§6.10), sobre fundo branco. Corre-se só quando o logótipo muda:
 *   npx tsx scripts/gerar-imagem-partilha.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const RAIZ = new URL("..", import.meta.url).pathname;
const logo = readFileSync(join(RAIZ, "site/public/marca/arciprestado-horizontal.svg"), "utf8");
const viewBox = /viewBox="([^"]+)"/.exec(logo)?.[1];
if (!viewBox) throw new Error("O logótipo não tem viewBox.");
const [, , largura, altura] = viewBox.split(/\s+/).map(Number) as [number, number, number, number];

const L = 1200;
const A = 630;
const w = 920;
const h = (w * altura) / largura;
const interior = logo.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
<rect width="${L}" height="${A}" fill="#ffffff"/>
<rect y="${A - 12}" width="${L}" height="12" fill="#B09247"/>
<svg x="${(L - w) / 2}" y="${(A - h) / 2 - 6}" width="${w}" height="${h}" viewBox="${viewBox}">${interior}</svg>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: L } }).render().asPng();
writeFileSync(join(RAIZ, "site/public/partilha.png"), png);
console.log(`✓ site/public/partilha.png (${png.length} bytes)`);
