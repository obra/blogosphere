// ABOUTME: Tauri app entry point — registers platform plugins (sql, http, fs,
// ABOUTME: clipboard-manager), the keychain commands, and dev-only logging.

mod keychain;

/// Runs the Tauri application. This is the process entry point.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start (e.g. the webview can't be
/// created). There is no meaningful way to recover from that at this point.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_get,
            keychain::keychain_set,
            keychain::keychain_delete,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
