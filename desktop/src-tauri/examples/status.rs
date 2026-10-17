//! Prints the runtime status as JSON, against the real local Docker, without the GUI:
//!
//!     cargo run --example status -- <data-dir>
//!
//! `<data-dir>` plays the role of the app's data directory (it gets `runtime/` and
//! `docker-config/`). Useful for checking discovery from a Finder-like environment:
//!
//!     env -i HOME="$HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin target/debug/examples/status <dir>

use std::path::Path;

#[tokio::main]
async fn main() {
    let dir = std::env::args().nth(1).expect("usage: status <data-dir>");
    let runtime =
        arbodat_plus_lib::runtime::RuntimeManager::new(env!("CARGO_PKG_VERSION"), Path::new(&dir))
            .expect("valid package version");
    let status = runtime.status().await;
    println!(
        "{}",
        serde_json::to_string_pretty(&status).expect("serializable")
    );
}
