from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_text(200, "hello from python vanilla\n")
            return

        if self.path == "/health":
            self.send_json(200, {"status": "ok", "runtime": "python-vanilla"})
            return

        self.send_text(404, "not found\n")

    def send_text(self, status_code, body):
        payload = body.encode("utf-8")
        self.send_response(status_code)
        self.send_header("content-type", "text/plain; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_json(self, status_code, body):
        payload = f"{json.dumps(body)}\n".encode("utf-8")
        self.send_response(status_code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"python vanilla listening on :{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
