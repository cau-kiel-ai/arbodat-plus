//! Drives install / start / stop against the real local Docker, without the GUI:
//!
//!     cargo run --example lifecycle -- <data-dir> install|start|stop|remove|status
//!     cargo run --example lifecycle -- <data-dir> port <new-port>
//!
//! `<data-dir>` plays the role of the app's data directory. Progress and the final result are
//! printed. WARNING: install creates the real data volume `arbodat-plus-database` and uses the
//! real port (8480), exactly like the app; use a scratch directory and clean up afterwards.

use std::path::Path;

use arbodat_plus_lib::runtime::RuntimeManager;
use arbodat_plus_lib::runtime::model::ProgressEvent;

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args
        .next()
        .expect("usage: lifecycle <data-dir> install|start|stop|remove|status|port <n>");
    let action = args
        .next()
        .expect("usage: lifecycle <data-dir> install|start|stop|remove|status|port <n>");
    let runtime = RuntimeManager::new(env!("CARGO_PKG_VERSION"), Path::new(&dir))
        .expect("valid package version");

    let started = std::time::Instant::now();
    let emit = |event: ProgressEvent| {
        let t = started.elapsed().as_secs_f32();
        match event {
            ProgressEvent::Step {
                index,
                total,
                label,
            } => println!("[{t:6.1}s] STEP {index}/{total}: {label}"),
            ProgressEvent::Log { text } => println!("[{t:6.1}s]     {text}"),
        }
    };
    let result = match action.as_str() {
        "install" => runtime.install(&emit).await,
        "start" => runtime.start(&emit).await,
        "stop" => runtime.stop(&emit).await,
        "remove" => runtime.remove(&emit).await,
        "port" => {
            let port = args
                .next()
                .and_then(|p| p.parse().ok())
                .expect("usage: lifecycle <data-dir> port <number>");
            runtime.change_port(port, &emit).await
        }
        "status" => {
            let status = runtime.status().await;
            println!(
                "{}",
                serde_json::to_string_pretty(&status.stack).expect("serializable")
            );
            return;
        }
        other => panic!("unknown action {other:?}"),
    };
    match result {
        Ok(()) => println!("RESULT: ok ({:.1}s)", started.elapsed().as_secs_f32()),
        Err(e) => {
            println!(
                "RESULT: ERROR code={:?}\n  message: {}\n  detail: {}",
                e.code,
                e.message,
                e.detail.as_deref().unwrap_or("-")
            );
            std::process::exit(1);
        }
    }
}
