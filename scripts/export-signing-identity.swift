// ABOUTME: Exports ONE code-signing identity (certificate + private key) as a
// ABOUTME: passphrase-protected .p12; the passphrase comes from stdin, never argv.
//
// Usage: printf '%s\n' "$passphrase" | swift scripts/export-signing-identity.swift \
//          <certificate SHA-1> <out.p12> [keychain path]
//
// Why not `security export`: it exports every identity in a keychain at once,
// and would put all of them (not just the Developer ID) into CI's secrets.
// macOS asks the person to allow the private key's export; nothing here can
// answer that prompt. Used by set-release-secrets.sh; tested by
// test-export-signing-identity.sh.
import CryptoKit
import Foundation
import Security

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("error: \(message)\n".utf8))
  exit(1)
}

func sha1Hex(of identity: SecIdentity) -> String? {
  var certificate: SecCertificate?
  guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess,
    let certificate
  else { return nil }
  let der = SecCertificateCopyData(certificate) as Data
  return Insecure.SHA1.hash(data: der).map { String(format: "%02X", $0) }.joined()
}

let arguments = CommandLine.arguments
guard arguments.count == 3 || arguments.count == 4 else {
  fail("usage: export-signing-identity.swift <certificate SHA-1> <out.p12> [keychain path]")
}
let wantedSHA1 = arguments[1].uppercased()
let outputPath = arguments[2]

guard let passphrase = readLine(strippingNewline: true), !passphrase.isEmpty else {
  fail("no passphrase on stdin")
}

var query: [String: Any] = [
  kSecClass as String: kSecClassIdentity,
  kSecReturnRef as String: true,
  kSecMatchLimit as String: kSecMatchLimitAll,
]
if arguments.count == 4 {
  // SecKeychainOpen succeeds for a path that doesn't exist; check first.
  guard FileManager.default.fileExists(atPath: arguments[3]) else {
    fail("no such keychain: \(arguments[3])")
  }
  var keychain: SecKeychain?
  guard SecKeychainOpen(arguments[3], &keychain) == errSecSuccess, let keychain else {
    fail("can't open keychain \(arguments[3])")
  }
  query[kSecMatchSearchList as String] = [keychain]
}

var found: CFTypeRef?
guard SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess,
  let identities = found as? [SecIdentity]
else {
  fail("no signing identities found")
}
guard let identity = identities.first(where: { sha1Hex(of: $0) == wantedSHA1 }) else {
  fail("no identity with certificate SHA-1 \(wantedSHA1)")
}

var parameters = SecItemImportExportKeyParameters()
parameters.version = UInt32(SEC_KEY_IMPORT_EXPORT_PARAMS_VERSION)
parameters.passphrase = Unmanaged.passRetained(passphrase as CFString as CFTypeRef)
defer { parameters.passphrase?.release() }

var exported: CFData?
let status = SecItemExport(identity, .formatPKCS12, [], &parameters, &exported)
guard status == errSecSuccess, let exported else {
  let reason = SecCopyErrorMessageString(status, nil) as String? ?? "status \(status)"
  fail("export failed: \(reason)")
}

// Created 0600 (and never over an existing file) before any bytes land, so
// the private key is never readable by anyone else.
let descriptor = open(outputPath, O_WRONLY | O_CREAT | O_EXCL, 0o600)
guard descriptor >= 0 else {
  fail("can't create \(outputPath): \(String(cString: strerror(errno)))")
}
let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
do {
  try handle.write(contentsOf: exported as Data)
  try handle.close()
} catch {
  unlink(outputPath)
  fail("can't write \(outputPath): \(error)")
}
