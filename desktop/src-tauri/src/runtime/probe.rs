//! "Does ArboDat+ actually answer?" Containers being healthy isn't quite enough: nginx resolves
//! the web-api lazily, so right after start-up the first requests can still fail with 502.
//!
//! A deliberately tiny HTTP/1.1 client over a TCP socket (no new dependency): it only talks to
//! 127.0.0.1 and only reads the status line.

use std::time::{Duration, Instant};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const READ_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_EVERY: Duration = Duration::from_secs(1);

/// What must answer 200 for ArboDat+ to count as running: nginx itself, and a real request
/// through nginx to the web-api and the database behind it.
pub const READY_PATHS: [&str; 2] = ["/healthz", "/api/results?page=0&size=1"];

/// The HTTP status code of `GET path`.
pub async fn status_of(port: u16, path: &str) -> Result<u16, String> {
    let mut stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(("127.0.0.1", port)))
        .await
        .map_err(|_| "connection timed out".to_string())?
        .map_err(|e| format!("connection failed: {e}"))?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUser-Agent: ArboDat+-desktop\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("sending failed: {e}"))?;

    let mut head = Vec::with_capacity(512);
    let mut buf = [0u8; 256];
    let read_status_line = async {
        while !head.windows(2).any(|w| w == b"\r\n") && head.len() < 4096 {
            let n = stream
                .read(&mut buf)
                .await
                .map_err(|e| format!("reading failed: {e}"))?;
            if n == 0 {
                break;
            }
            head.extend_from_slice(&buf[..n]);
        }
        Ok::<(), String>(())
    };
    tokio::time::timeout(READ_TIMEOUT, read_status_line)
        .await
        .map_err(|_| "no answer".to_string())??;

    let line = String::from_utf8_lossy(&head);
    let line = line.lines().next().unwrap_or("");
    line.strip_prefix("HTTP/1.")
        .and_then(|rest| rest.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| format!("unexpected answer: {line:?}"))
}

/// Polls until every ready path answers 200, or `deadline` has passed. `on_waiting` gets a short
/// reason whenever a poll fails (so the UI can show that something is still happening).
pub async fn wait_ready(
    port: u16,
    deadline: Duration,
    mut on_waiting: impl FnMut(&str),
) -> Result<(), String> {
    let end = Instant::now() + deadline;
    loop {
        let mut problem = None;
        for path in READY_PATHS {
            match status_of(port, path).await {
                Ok(200) => {}
                Ok(code) => {
                    problem = Some(format!("{path} answered {code}"));
                    break;
                }
                Err(e) => {
                    problem = Some(format!("{path}: {e}"));
                    break;
                }
            }
        }
        let Some(problem) = problem else {
            return Ok(());
        };
        if Instant::now() >= end {
            return Err(format!(
                "ArboDat+ did not answer within {} s (last check: {problem})",
                deadline.as_secs()
            ));
        }
        on_waiting(&problem);
        tokio::time::sleep(POLL_EVERY).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};
    use tokio::net::TcpListener;

    /// A server that answers every request with the status returned by `status_for(request_count)`.
    async fn serve(
        status_for: impl Fn(u32) -> &'static str + Send + Sync + 'static,
    ) -> (u16, Arc<AtomicU32>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let count = Arc::new(AtomicU32::new(0));
        let counter = count.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    return;
                };
                let n = counter.fetch_add(1, Ordering::SeqCst);
                let status = status_for(n);
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let _ = sock.read(&mut buf).await;
                    let _ = sock
                        .write_all(
                            format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\n\r\n").as_bytes(),
                        )
                        .await;
                });
            }
        });
        (port, count)
    }

    #[tokio::test]
    async fn reads_the_status_code() {
        let (port, _) = serve(|_| "200 OK").await;
        assert_eq!(status_of(port, "/healthz").await, Ok(200));
        let (port, _) = serve(|_| "502 Bad Gateway").await;
        assert_eq!(status_of(port, "/api/x").await, Ok(502));
    }

    #[tokio::test]
    async fn refused_connection_is_an_error_not_a_panic() {
        let port = {
            let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
            l.local_addr().unwrap().port()
        };
        assert!(
            status_of(port, "/")
                .await
                .unwrap_err()
                .contains("connection failed")
        );
    }

    #[tokio::test]
    async fn garbage_answer_is_reported() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let _ = sock.write_all(b"SSH-2.0-OpenSSH\r\n").await;
        });
        assert!(
            status_of(port, "/")
                .await
                .unwrap_err()
                .contains("unexpected answer")
        );
    }

    #[tokio::test]
    async fn waits_through_502_until_both_paths_answer_200() {
        // The first 3 requests fail like nginx does while the web-api is still starting.
        let (port, _) = serve(|n| if n < 3 { "502 Bad Gateway" } else { "200 OK" }).await;
        let mut waits = Vec::new();
        wait_ready(port, Duration::from_secs(20), |why| {
            waits.push(why.to_string())
        })
        .await
        .unwrap();
        assert!(!waits.is_empty(), "it must have waited at least once");
        assert!(waits[0].contains("502"), "{waits:?}");
    }

    #[tokio::test]
    async fn gives_up_at_the_deadline_with_the_last_problem() {
        let (port, _) = serve(|_| "502 Bad Gateway").await;
        let err = wait_ready(port, Duration::from_millis(1500), |_| {})
            .await
            .unwrap_err();
        assert!(
            err.contains("did not answer within") && err.contains("502"),
            "{err}"
        );
    }
}
