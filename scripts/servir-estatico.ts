/**
 * Servidor estático mínimo para os testes de ponta a ponta (sem o Worker nem o Access):
 *   tsx scripts/servir-estatico.ts <pasta> <porta>
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const pasta = resolve(process.argv[2] ?? "site/dist");
const porta = Number(process.argv[3] ?? 4322);
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer((pedido, resposta) => {
  const caminho = decodeURIComponent(new URL(pedido.url ?? "/", "http://x").pathname);
  let arquivo = normalize(join(pasta, caminho));
  if (!arquivo.startsWith(pasta)) {
    resposta.writeHead(403).end();
    return;
  }
  if (existsSync(arquivo) && statSync(arquivo).isDirectory()) arquivo = join(arquivo, "index.html");
  if (!existsSync(arquivo)) {
    resposta.writeHead(404).end("404");
    return;
  }
  resposta.writeHead(200, {
    "content-type": TIPOS[extname(arquivo)] ?? "application/octet-stream",
  });
  createReadStream(arquivo).pipe(resposta);
}).listen(porta, "127.0.0.1", () => console.log(`Servidor em http://127.0.0.1:${porta}`));
