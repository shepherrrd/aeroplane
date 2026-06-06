import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

class Server {
    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);

        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();

            if (path.equals("/")) {
                send(exchange, 200, "text/plain; charset=utf-8", "hello from java vanilla\n");
                return;
            }

            if (path.equals("/health")) {
                send(exchange, 200, "application/json", "{\"status\":\"ok\",\"runtime\":\"java-vanilla\"}\n");
                return;
            }

            send(exchange, 404, "text/plain; charset=utf-8", "not found\n");
        });

        server.start();
        System.out.printf("java vanilla listening on :%d%n", port);
    }

    private static void send(HttpExchange exchange, int statusCode, String contentType, String body)
        throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().set("content-type", contentType);
        exchange.sendResponseHeaders(statusCode, payload.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
        }
    }
}
