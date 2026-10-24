//! The mouse's back and forward buttons in the ArboDat+ window. WKWebView never hands those
//! buttons to the page (Safari handles them in the app around it), so a JavaScript listener can't
//! see them; they are picked up here, as AppKit events, before the webview does. (The webviews
//! of Windows and Linux react to them on their own.)
//!
//! Two kinds of event are understood: the side buttons themselves (`otherMouseUp`, buttons 3 and
//! 4), and horizontal swipes, which is what trackpad gestures and helpers such as
//! SensibleSideButton (which turns the side buttons into swipes) send.

use std::ffi::c_void;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
use tauri::AppHandle;

use super::arbodat::{self, Step};
use super::main_window;

/// `NSEvent.buttonNumber`: 0 left, 1 right, 2 middle, 3 the button for "back", 4 for "forward".
fn step_for(button_number: isize) -> Option<Step> {
    match button_number {
        3 => Some(Step::Back),
        4 => Some(Step::Forward),
        _ => None,
    }
}

/// A swipe to the right goes back, to the left forward, like in Safari. A swipe event with no
/// direction (one comes first, then the one with the direction) does nothing.
fn step_for_swipe(delta_x: f64) -> Option<Step> {
    if delta_x > 0.0 {
        Some(Step::Back)
    } else if delta_x < 0.0 {
        Some(Step::Forward)
    } else {
        None
    }
}

/// Whether the event happened in the app's window.
fn in_arbodat_window(app: &AppHandle, event: &NSEvent, mtm: MainThreadMarker) -> bool {
    let Some(window) = main_window(app) else {
        return false;
    };
    let Ok(ns_window) = window.ns_window() else {
        return false;
    };
    event
        .window(mtm)
        .is_some_and(|w| Retained::as_ptr(&w).cast::<c_void>() == ns_window.cast_const())
}

pub fn install(app: &AppHandle) {
    let app = app.clone();
    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit passes a valid event and keeps it alive for the call.
        let ns_event = unsafe { event.as_ref() };
        let (step, swallow) = match ns_event.r#type() {
            NSEventType::OtherMouseUp => (step_for(ns_event.buttonNumber()), true),
            // Swipes go on to AppKit afterwards: swallowing half of a gesture confuses it.
            NSEventType::Swipe => (step_for_swipe(ns_event.deltaX()), false),
            _ => (None, false),
        };
        if let (Some(step), Some(mtm)) = (step, MainThreadMarker::new())
            && in_arbodat_window(&app, ns_event, mtm)
        {
            arbodat::step(&app, step);
            if swallow {
                // The webview must not treat the button as another click.
                return std::ptr::null_mut();
            }
        }
        event.as_ptr()
    });
    // SAFETY: the block returns the event it was given, or null.
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::OtherMouseUp | NSEventMask::Swipe,
            &handler,
        )
    };
    // The monitor lives as long as the app does.
    std::mem::forget(monitor);
    std::mem::forget(handler);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swipes_go_back_to_the_right_and_forward_to_the_left() {
        // Values seen from SensibleSideButton: back is +1, forward is -1.
        assert_eq!(step_for_swipe(1.0), Some(Step::Back));
        assert_eq!(step_for_swipe(-1.0), Some(Step::Forward));
        assert_eq!(step_for_swipe(0.0), None);
    }

    #[test]
    fn only_the_two_side_buttons_navigate() {
        assert_eq!(step_for(3), Some(Step::Back));
        assert_eq!(step_for(4), Some(Step::Forward));
        for other in [0, 1, 2, 5, 6, -1] {
            assert_eq!(step_for(other), None, "button {other}");
        }
    }
}
