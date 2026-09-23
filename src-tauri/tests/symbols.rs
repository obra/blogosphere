// ABOUTME: Main-thread checks for the SF Symbol renderer (harness = false:
// ABOUTME: AppKit drawing wants the main thread, and libtest doesn't provide it).

#[cfg(target_os = "macos")]
fn main() {
    use app_lib::symbols::{render_symbol_png, sf_symbols_available, SymbolWeight};

    assert!(
        sf_symbols_available(),
        "this Mac (macOS 11+) has the SF Symbols APIs"
    );

    let png = render_symbol_png("square.and.pencil", 16.0, SymbolWeight::Regular, 2.0)
        .expect("known symbol renders");
    assert_eq!(&png.png[..8], b"\x89PNG\r\n\x1a\n", "output is a PNG");
    let px_wide = u32::from_be_bytes(png.png[16..20].try_into().expect("IHDR width"));
    let px_high = u32::from_be_bytes(png.png[20..24].try_into().expect("IHDR height"));
    assert!(
        png.width > 8.0 && png.height > 8.0,
        "point size is plausible: {}x{}",
        png.width,
        png.height
    );
    assert_eq!(
        px_wide,
        expected_pixels(png.width),
        "pixels = points x 2 (width)"
    );
    assert_eq!(
        px_high,
        expected_pixels(png.height),
        "pixels = points x 2 (height)"
    );

    let err = render_symbol_png("definitely.not.a.symbol", 16.0, SymbolWeight::Regular, 2.0)
        .expect_err("unknown symbol is an error");
    assert!(
        err.contains("definitely.not.a.symbol"),
        "error names the symbol: {err}"
    );

    println!(
        "symbols: ok ({}x{} pt -> {px_wide}x{px_high} px)",
        png.width, png.height
    );
}

#[cfg(target_os = "macos")]
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // tiny positive sizes
fn expected_pixels(points: f64) -> u32 {
    (points * 2.0).ceil() as u32
}

#[cfg(not(target_os = "macos"))]
fn main() {}
