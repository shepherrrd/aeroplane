const http = require("node:http");

const port = process.env.PORT || 8080;

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    sendJson(response, 200, {
      status: "ok",
      runtime: "node",
    });
    return;
  }

  if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("hello from js node\n");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`js node listening on :${port}`);
});

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}
