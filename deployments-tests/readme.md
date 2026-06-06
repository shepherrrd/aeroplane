# Deployments Tests

Small deployment smoke-test apps grouped by language, runtime, and framework.

Every example exposes the same routes:

- `GET /` returns a short service message.
- `GET /health` returns a JSON health response.

Every example reads the `PORT` environment variable and falls back to `8080`.

## Structure

```txt
deployments-tests/
  go/
    vanilla/
    fiber/
  java/
    vanilla/
    spring-boot/
  js/
    node/
    express/
  python/
    vanilla/
  rust/
    vanilla/
    axum/
```

## Run Commands

| Example | Command |
| --- | --- |
| Go vanilla | `cd go/vanilla && go run .` |
| Go Fiber | `cd go/fiber && go run .` |
| Java vanilla | `cd java/vanilla && java server.java` |
| Java Spring Boot | `cd java/spring-boot && mvn spring-boot:run` |
| JavaScript Node | `cd js/node && npm start` |
| JavaScript Express | `cd js/express && npm install && npm start` |
| Python vanilla | `cd python/vanilla && python3 main.py` |
| Rust vanilla | `cd rust/vanilla && cargo run` |
| Rust Axum | `cd rust/axum && cargo run` |

Run from this directory:

```sh
cd deployments-tests
PORT=8080 <command>
```
