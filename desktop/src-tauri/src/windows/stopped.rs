//! What the ArboDat+ window shows after the stack has been stopped from the Control Center: the
//! layout of the web app's own license page (frontend/license.html) with one line of text. The
//! real pages can't be shown, there is nothing behind them any more.
//!
//! It is a `data:` URL, so it needs no server and a reload keeps showing it.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use tauri::Url;

const PAGE: &str = include_str!("stopped.html");
/// The logo the web app shows, so the page looks like its sibling.
const LOGO: &[u8] = include_bytes!("../../../../frontend/img/logo_arbodat_plus.png");

pub fn url() -> Url {
    let html = PAGE.replace("{{LOGO}}", &STANDARD.encode(LOGO));
    Url::parse(&format!(
        "data:text/html;charset=utf-8;base64,{}",
        STANDARD.encode(html)
    ))
    .expect("a data URL built from base64 is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_page_is_a_data_url_with_one_line_of_text_and_the_logo() {
        let url = url();
        assert_eq!(url.scheme(), "data");
        let payload = url
            .path()
            .strip_prefix("text/html;charset=utf-8;base64,")
            .expect("html as base64");
        let html = String::from_utf8(STANDARD.decode(payload).unwrap()).unwrap();
        // The logo says "ArboDat+"; the one line of text under it completes the sentence.
        assert!(html.contains("<title>ArboDat+ is stopped</title>"));
        assert!(html.contains(">is stopped</p>"));
        assert_eq!(html.matches("<p ").count(), 1, "one line of text");
        assert!(
            html.contains("data:image/png;base64,iVBOR"),
            "the logo is embedded"
        );
        assert!(!html.contains("{{LOGO}}"));
        assert!(!html.contains("<script"), "nothing to run in the window");
    }
}
