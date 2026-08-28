import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const ROUTES: Readonly<Record<string, string>> = {
  "/kitten/ads.html": join(
    repoRoot,
    "mods",
    "kitten-ad-replace",
    "fixtures",
    "ads.html",
  ),
};

export async function startFixtureServer(): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request, response) => {
    const path = requestUrlPath(request);
    const file = path === undefined ? undefined : ROUTES[path];
    if (file === undefined) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(readFileSync(file));
  });

  const origin = await listen(server);
  return {
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function requestUrlPath(request: IncomingMessage): string | undefined {
  if (request.url === undefined) {
    return undefined;
  }
  return new URL(request.url, "http://127.0.0.1").pathname;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
