// ABOUTME: OS keychain commands backed by the `keyring` crate. The GitHub PAT is the
// ABOUTME: only secret stored; SQLite and logs never see it (see spec: Auth & security).

use keyring::Error as KeyringError;

/// Keychain service name every secret this app stores is filed under.
const SERVICE: &str = "com.fsck.blogosphere";

/// Error message returned when a command is called with an empty key.
const EMPTY_KEY_MESSAGE: &str = "keychain key must not be empty";

/// Reads a secret from the OS keychain.
///
/// Returns `Ok(None)` if no credential is stored for `key`.
///
/// # Errors
///
/// Returns `Err` with a human-readable message if the platform keychain
/// cannot be reached, or if `key` is invalid (e.g. empty — the macOS keychain
/// treats an empty account name as a wildcard, so it is rejected here rather
/// than silently matching an unrelated entry).
#[tauri::command]
pub fn keychain_get(key: &str) -> Result<Option<String>, String> {
    let entry = entry_for(key)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Writes a secret to the OS keychain, overwriting any existing value for `key`.
///
/// # Errors
///
/// Returns `Err` with a human-readable message if the platform keychain
/// cannot be reached, or if `key` is invalid (see [`keychain_get`]).
#[tauri::command]
pub fn keychain_set(key: &str, value: &str) -> Result<(), String> {
    let entry = entry_for(key)?;
    entry.set_password(value).map_err(|err| err.to_string())
}

/// Deletes a secret from the OS keychain. Deleting a key that has no stored
/// secret is treated as success, so callers can delete idempotently.
///
/// # Errors
///
/// Returns `Err` with a human-readable message if the platform keychain
/// cannot be reached, or if `key` is invalid (see [`keychain_get`]).
#[tauri::command]
pub fn keychain_delete(key: &str) -> Result<(), String> {
    let entry = entry_for(key)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

/// Builds the keychain entry for `key`, rejecting empty keys up front (see
/// `keychain_get` docs for why an empty account name is refused).
fn entry_for(key: &str) -> Result<keyring::Entry, String> {
    if key.is_empty() {
        return Err(EMPTY_KEY_MESSAGE.to_string());
    }
    keyring::Entry::new(SERVICE, key).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_key_without_touching_the_keychain() {
        assert_eq!(keychain_get(""), Err(EMPTY_KEY_MESSAGE.to_string()));
        assert_eq!(
            keychain_set("", "value"),
            Err(EMPTY_KEY_MESSAGE.to_string())
        );
        assert_eq!(keychain_delete(""), Err(EMPTY_KEY_MESSAGE.to_string()));
    }
}
