//! Server mode: ArboDat+ runs on a server of the institute and this app is only a window onto it.
//! The address is validated and tidied here, and checked with a request to `/healthz`, the same
//! address the Docker health check uses.

use std::time::Duration;

use serde::Serialize;
use tauri::Url;
use ts_rs::TS;

use crate::runtime::error::{AppError, ErrorCode};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_PATH: &str = "healthz";

/// The address typed by the user, tidied up: `https://` if no scheme was given, no query or
/// fragment, no file name at the end, always a trailing slash (relative links of the web app
/// resolve against it, also when the server hosts it under a sub-path).
pub fn normalize_url(input: &str) -> Result<Url, AppError> {
    let invalid = |message: &str| AppError::new(ErrorCode::InvalidInput, message);
    let typed = input.trim();
    if typed.is_empty() {
        return Err(invalid("Please enter the address of the server."));
    }
    let with_scheme = if typed.contains("://") {
        typed.to_string()
    } else {
        format!("https://{typed}")
    };
    let mut url = Url::parse(&with_scheme)
        .map_err(|e| invalid("That doesn't look like a web address.").with_detail(e.to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(invalid(
            "Only addresses starting with http:// or https:// can be used.",
        ));
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err(invalid("That address has no server name."));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(invalid(
            "Addresses with a user name or password in them can't be used.",
        ));
    }
    url.set_query(None);
    url.set_fragment(None);
    // "https://server/arbodat/index.html" (or ".../healthz") means the folder "https://server/arbodat/".
    let mut path = url.path().to_string();
    if !path.ends_with('/') {
        match path.rsplit_once('/') {
            Some((folder, last)) if last.contains('.') || last == HEALTH_PATH => {
                path = format!("{folder}/");
            }
            _ => path.push('/'),
        }
    }
    url.set_path(&path);
    Ok(url)
}

fn client() -> Result<reqwest::Client, AppError> {
    // reqwest is built without a crypto provider (see Cargo.toml); install ring once. An error
    // only says that one is installed already.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(TOTAL_TIMEOUT)
        .user_agent(concat!("ArboDat+-desktop/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| {
            AppError::new(ErrorCode::Io, "The app couldn't prepare a web request.")
                .with_detail(format!("{e:?}"))
        })
}

/// All causes of a request error on one line ("error sending request: ... certificate expired").
fn chain(e: &dyn std::error::Error) -> String {
    let mut text = e.to_string();
    let mut source = e.source();
    while let Some(cause) = source {
        text.push_str(": ");
        text.push_str(&cause.to_string());
        source = cause.source();
    }
    text
}

/// Does an ArboDat+ server answer at `base`? On success, the address that really serves it: the
/// same one unless the server redirected (from http to https, say), in which case the window must
/// start from where the redirect led, or its own address would count as a foreign site.
pub async fn check(base: &Url) -> Result<Url, AppError> {
    let health = base.join(HEALTH_PATH).expect("a relative path joins");
    let response = client()?.get(health.clone()).send().await.map_err(|e| {
        let message = if e.is_timeout() {
            format!(
                "{} didn't answer in time.",
                base.host_str().unwrap_or("The server")
            )
        } else {
            format!(
                "{} can't be reached.",
                base.host_str().unwrap_or("The server")
            )
        };
        AppError::new(ErrorCode::ServerUnreachable, message).with_detail(chain(&e))
    })?;
    let status = response.status();
    let reached = response.url().clone();
    if status != reqwest::StatusCode::OK {
        return Err(AppError::new(
            ErrorCode::NotArbodat,
            format!(
                "The server answered, but not like ArboDat+ does (HTTP {}). Is the address complete?",
                status.as_u16()
            ),
        )
        .with_detail(reached.to_string()));
    }
    // ".../healthz" -> "...": the base address the answer came from.
    let path = reached.path();
    let Some(folder) = path.strip_suffix(HEALTH_PATH) else {
        return Err(AppError::new(
            ErrorCode::NotArbodat,
            "The server answered, but sent us somewhere that isn't ArboDat+.",
        )
        .with_detail(reached.to_string()));
    };
    let mut served = reached.clone();
    served.set_path(folder);
    served.set_query(None);
    served.set_fragment(None);
    Ok(served)
}

/// What the launcher shows for the server it is set up for.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ServerStatus {
    pub url: String,
    pub reachable: bool,
    /// Why not, when it isn't reachable.
    pub problem: Option<String>,
    pub detail: Option<String>,
}

pub async fn status(base: &Url) -> ServerStatus {
    match check(base).await {
        Ok(_) => ServerStatus {
            url: base.to_string(),
            reachable: true,
            problem: None,
            detail: None,
        },
        Err(e) => ServerStatus {
            url: base.to_string(),
            reachable: false,
            problem: Some(e.message),
            detail: e.detail,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn normalized(input: &str) -> String {
        normalize_url(input).unwrap().to_string()
    }

    fn rejected(input: &str) -> ErrorCode {
        normalize_url(input).unwrap_err().code
    }

    #[test]
    fn addresses_are_tidied() {
        assert_eq!(
            normalized("arbodat.example.org"),
            "https://arbodat.example.org/"
        );
        assert_eq!(
            normalized("  http://10.0.0.5:8480  "),
            "http://10.0.0.5:8480/"
        );
        assert_eq!(
            normalized("HTTPS://Arbodat.Example.ORG/"),
            "https://arbodat.example.org/"
        );
        assert_eq!(
            normalized("https://example.org/arbodat"),
            "https://example.org/arbodat/"
        );
        assert_eq!(
            normalized("https://example.org/arbodat/index.html?x=1#top"),
            "https://example.org/arbodat/"
        );
        assert_eq!(
            normalized("https://example.org:443/"),
            "https://example.org/"
        );
        assert_eq!(normalized("localhost:8480"), "https://localhost:8480/");
    }

    #[test]
    fn unusable_addresses_are_refused() {
        for bad in [
            "",
            "   ",
            "ftp://example.org/",
            "file:///etc/hosts",
            "javascript:alert(1)",
            "https://",
            "https://user:secret@example.org/",
            "https://user@example.org/",
            "https://exa mple.org/",
        ] {
            assert_eq!(rejected(bad), ErrorCode::InvalidInput, "{bad:?}");
        }
    }

    /// A tiny web server: `answer(path)` gives the status line and extra headers for a request.
    async fn serve(answer: impl Fn(&str) -> String + Send + Sync + 'static) -> Url {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let mut buf = vec![0u8; 4096];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = request.split_whitespace().nth(1).unwrap_or("/").to_string();
                let reply = format!(
                    "{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    answer(&path)
                );
                let _ = socket.write_all(reply.as_bytes()).await;
            }
        });
        Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap()
    }

    #[tokio::test]
    async fn an_arbodat_server_is_recognised() {
        let base = serve(|path| match path {
            "/healthz" => "HTTP/1.1 200 OK".into(),
            _ => "HTTP/1.1 404 Not Found".into(),
        })
        .await;
        assert_eq!(check(&base).await.unwrap(), base);
        assert!(status(&base).await.reachable);
    }

    #[tokio::test]
    async fn a_sub_path_is_kept() {
        let base = serve(|path| match path {
            "/arbodat/healthz" => "HTTP/1.1 200 OK".into(),
            _ => "HTTP/1.1 404 Not Found".into(),
        })
        .await
        .join("arbodat/")
        .unwrap();
        assert_eq!(check(&base).await.unwrap(), base);
    }

    #[tokio::test]
    async fn a_redirect_moves_the_base_address_along() {
        let base = serve(|path| match path {
            "/healthz" => "HTTP/1.1 301 Moved Permanently\r\nLocation: /new/healthz".into(),
            "/new/healthz" => "HTTP/1.1 200 OK".into(),
            _ => "HTTP/1.1 404 Not Found".into(),
        })
        .await;
        assert_eq!(check(&base).await.unwrap(), base.join("new/").unwrap());
    }

    #[tokio::test]
    async fn a_server_that_is_not_arbodat_is_reported_as_such() {
        let base = serve(|_| "HTTP/1.1 404 Not Found".into()).await;
        assert_eq!(check(&base).await.unwrap_err().code, ErrorCode::NotArbodat);
        // Redirected to a login page: also not ArboDat+.
        let base = serve(|path| match path {
            "/healthz" => "HTTP/1.1 302 Found\r\nLocation: /login".into(),
            _ => "HTTP/1.1 200 OK".into(),
        })
        .await;
        assert_eq!(check(&base).await.unwrap_err().code, ErrorCode::NotArbodat);
    }

    /// Needs the internet: a real HTTPS handshake against the operating system's trusted
    /// certificates. A web server that isn't ArboDat+ must be reported as such (it answered over
    /// TLS), not as unreachable. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "needs the internet"]
    async fn https_works_with_the_system_certificates() {
        let base = normalize_url("example.org").unwrap();
        assert_eq!(check(&base).await.unwrap_err().code, ErrorCode::NotArbodat);
        let expired = normalize_url("expired.badssl.com").unwrap();
        let e = check(&expired).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::ServerUnreachable, "{e:?}");
    }

    #[tokio::test]
    async fn nobody_listening_is_reported_as_unreachable() {
        let port = {
            let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
            l.local_addr().unwrap().port()
        };
        let base = Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
        let e = check(&base).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::ServerUnreachable);
        assert!(e.detail.is_some_and(|d| !d.is_empty()));
        let s = status(&base).await;
        assert!(!s.reachable && s.problem.is_some());
    }
}
