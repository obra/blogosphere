// ABOUTME: The macOS glass sidebar: Liquid Glass behind the transparent window
// ABOUTME: unless Reduce Transparency is on, re-applied live when that setting changes.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether glass is on right now; read by the `glass_active` command.
#[derive(Default)]
pub struct GlassState(AtomicBool);

/// Glass goes behind the window unless the person asked macOS to reduce
/// transparency.
// Only macOS applies glass; elsewhere this would be dead code, which
// `warnings = "deny"` turns into a failed iOS/Android build.
#[cfg(any(target_os = "macos", test))]
#[must_use]
pub fn glass_wanted(reduce_transparency: bool) -> bool {
    !reduce_transparency
}

#[tauri::command]
#[must_use]
#[allow(clippy::needless_pass_by_value)] // Tauri hands commands their State by value.
pub fn glass_active(state: tauri::State<'_, GlassState>) -> bool {
    state.0.load(Ordering::Relaxed)
}

#[cfg(target_os = "macos")]
fn reduce_transparency() -> bool {
    objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency()
}

/// Applies (or removes) the glass for the current setting, records it, and
/// tells the webview. With glass off the window gets an opaque background, so
/// it is never see-through before the web content paints.
#[cfg(target_os = "macos")]
fn apply(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    use tauri_plugin_liquid_glass::{LiquidGlassConfig, LiquidGlassExt};

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let wanted = glass_wanted(reduce_transparency());
    let config = LiquidGlassConfig {
        enabled: wanted,
        ..Default::default()
    };
    let active = match app.liquid_glass().set_effect(&window, config) {
        Ok(()) => wanted,
        Err(err) => {
            log::warn!("glass effect failed; using an opaque sidebar: {err}");
            false
        }
    };
    let background = if active {
        None
    } else if window
        .theme()
        .is_ok_and(|theme| theme == tauri::Theme::Dark)
    {
        Some(tauri::window::Color(30, 30, 30, 255))
    } else {
        Some(tauri::window::Color(236, 236, 236, 255))
    };
    if let Err(err) = window.set_background_color(background) {
        log::warn!("couldn't set the window background: {err}");
    }
    app.state::<GlassState>().0.store(active, Ordering::Relaxed);
    if let Err(err) = app.emit("glass-changed", active) {
        log::warn!("couldn't announce the glass change: {err}");
    }
}

/// Applies the glass at launch and re-applies it whenever the accessibility
/// display options (Reduce Transparency among them) change.
#[cfg(target_os = "macos")]
pub fn install(app: &tauri::AppHandle) {
    use block2::RcBlock;
    use objc2_app_kit::{NSWorkspace, NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification};

    apply(app);
    let handle = app.clone();
    let block = RcBlock::new(move |_notification| apply(&handle));
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: the notification name is AppKit's own constant; no object or
    // queue filter; the block only captures a Send + Sync AppHandle.
    let token = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification),
            None,
            None,
            &block,
        )
    };
    // The observer lives as long as the app. The token isn't Send, so Tauri's
    // managed state can't hold it; leaking it is the lifetime we want.
    std::mem::forget(token);
}

#[cfg(test)]
mod tests {
    use super::glass_wanted;

    #[test]
    fn glass_unless_reduce_transparency() {
        assert!(glass_wanted(false));
        assert!(!glass_wanted(true));
    }
}
