// ABOUTME: Reports which OS this build targets, so the webview can pick its
// ABOUTME: platform look before first render (see the native Mac redesign spec §1).

/// The platform name the frontend's `Platform` type understands.
#[must_use]
pub fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[tauri::command]
#[must_use]
pub fn current_platform() -> &'static str {
    platform_name()
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(target_os = "macos")]
    fn reports_macos_on_macos() {
        assert_eq!(super::platform_name(), "macos");
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn reports_linux_on_linux() {
        assert_eq!(super::platform_name(), "linux");
    }
}
