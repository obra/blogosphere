// ABOUTME: The macOS Settings window: open_settings creates it the first time
// ABOUTME: and brings it forward after that (one window, like any Mac app).

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// The window's label: the settings capability and the web side use it too.
pub const SETTINGS_LABEL: &str = "settings";

/// Shows the Settings window, creating it if it isn't open yet.
///
/// # Errors
///
/// When the window can't be created, shown, or focused.
pub fn open_or_focus<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window.show()?;
        return window.set_focus();
    }
    // One pane today, so per the HIG: no toolbar, titled by app, sized to
    // its content (the page resizes it once it has laid out), and no
    // minimize or zoom.
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("Blogosphere Settings")
        .inner_size(500.0, 420.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .build()?;
    Ok(())
}

/// Async so window creation doesn't run on (and block) the main thread's
/// command handling.
///
/// # Errors
///
/// When the window can't be opened; the message is shown by the caller.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri hands commands their AppHandle by value.
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    open_or_focus(&app).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{open_or_focus, SETTINGS_LABEL};
    use tauri::Manager;

    #[test]
    fn opens_one_settings_window_however_often_asked() {
        let app = tauri::test::mock_app();
        open_or_focus(app.handle()).expect("first open");
        open_or_focus(app.handle()).expect("second open");
        let labels: Vec<String> = app.webview_windows().into_keys().collect();
        assert_eq!(labels, vec![SETTINGS_LABEL.to_string()]);
    }
}
