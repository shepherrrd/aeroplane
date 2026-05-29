import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const configuredScriptPath = process.env.INSTALL_SCRIPT_PATH || "install.sh";
const scriptPath = isAbsolute(configuredScriptPath)
  ? configuredScriptPath
  : resolve(appDir, configuredScriptPath);

let cachedScript = null;

async function installerScript() {
  if (cachedScript && process.env.NODE_ENV === "production") {
    return cachedScript;
  }

  const script = await readFile(scriptPath, "utf8");
  if (process.env.NODE_ENV === "production") {
    cachedScript = script;
  }
  return script;
}

function send(res, status, headers, body, method) {
  res.writeHead(status, headers);
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

function textHeaders(extra = {}) {
  return {
    "Cache-Control": "public, max-age=300",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extra
  };
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (!["GET", "HEAD"].includes(method)) {
    send(res, 405, textHeaders({ Allow: "GET, HEAD" }), "Method not allowed\n", method);
    return;
  }

  if (url.pathname === "/healthz") {
    send(res, 200, textHeaders({ "Cache-Control": "no-store" }), "ok\n", method);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/install.sh") {
    try {
      const script = await installerScript();
      send(res, 200, textHeaders(), script, method);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read installer";
      send(res, 500, textHeaders({ "Cache-Control": "no-store" }), `Unable to read installer: ${message}\n`, method);
    }
    return;
  }

  send(res, 404, textHeaders({ "Cache-Control": "no-store" }), "Not found\n", method);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`get-aeroplane listening on http://0.0.0.0:${port}`);
});
