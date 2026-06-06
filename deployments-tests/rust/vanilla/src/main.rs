use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn main() -> std::io::Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;

    println!("rust vanilla listening on :{port}");

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => handle_connection(&mut stream)?,
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }

    Ok(())
}

fn handle_connection(stream: &mut TcpStream) -> std::io::Result<()> {
    let mut buffer = [0; 1024];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    match path {
        "/" => send_response(
            stream,
            200,
            "text/plain; charset=utf-8",
            "hello from rust vanilla\n",
        ),
        "/health" => send_response(
            stream,
            200,
            "application/json",
            "{\"status\":\"ok\",\"runtime\":\"rust-vanilla\"}\n",
        ),
        _ => send_response(stream, 404, "text/plain; charset=utf-8", "not found\n"),
    }
}

fn send_response(
    stream: &mut TcpStream,
    status_code: u16,
    content_type: &str,
    body: &str,
) -> std::io::Result<()> {
    let status_text = match status_code {
        200 => "OK",
        404 => "Not Found",
        _ => "Internal Server Error",
    };

    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );

    stream.write_all(response.as_bytes())
}
