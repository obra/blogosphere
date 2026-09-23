// ABOUTME: Tauri app entry point — registers platform plugins (sql, http, fs,
// ABOUTME: clipboard-manager), the keychain commands, and dev-only logging.

mod glass;
mod keychain;
mod platform;
// Desktop only: mobile window builders have no size or decoration options,
// and `warnings = "deny"` would fail the mobile builds on unused code.
#[cfg(desktop)]
mod settings_window;
pub mod symbols;

/// The app's commands. Opening Settings is desktop-only (see `settings_window`).
#[cfg(desktop)]
fn commands() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        keychain::keychain_get,
        keychain::keychain_set,
        keychain::keychain_delete,
        platform::current_platform,
        symbols::render_symbol,
        glass::glass_active,
        settings_window::open_settings,
    ]
}

#[cfg(mobile)]
fn commands() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        keychain::keychain_get,
        keychain::keychain_set,
        keychain::keychain_delete,
        platform::current_platform,
        symbols::render_symbol,
        glass::glass_active,
    ]
}

/// Runs the Tauri application. This is the process entry point.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start (e.g. the webview can't be
/// created). There is no meaningful way to recover from that at this point.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .manage(glass::GlassState::default());
    // Lets the tauri-mcp CLI drive a dev build (screenshots, DOM, IPC). Never
    // in release builds, and localhost-only: the plugin's default 0.0.0.0
    // bind would hand app control to anyone on the network.
    let builder = if cfg!(debug_assertions) {
        builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .build(),
        )
    } else {
        builder
    };
    builder
        .invoke_handler(commands())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(target_os = "macos")]
            glass::install(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
