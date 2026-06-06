use axum::http::header;
use axum::response::IntoResponse;
use axum::{routing::get, Router};
use std::env;

#[tokio::main]
async fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health));
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind server address");

    println!("rust axum listening on :{port}");

    axum::serve(listener, app)
        .await
        .expect("failed to start server");
}

async fn root() -> &'static str {
    "hello from rust axum\n"
}

async fn health() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json")],
        "{\"status\":\"ok\",\"framework\":\"axum\"}\n",
    )
}
