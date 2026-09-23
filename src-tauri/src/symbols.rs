// ABOUTME: Renders SF Symbols to PNG at runtime via AppKit, so the webview can
// ABOUTME: show real system symbols without the repo ever shipping symbol files.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolWeight {
    Regular,
    Medium,
    Semibold,
}

/// A rendered symbol. `width`/`height` are in points; the PNG is
/// `ceil(points × scale)` pixels on each side.
#[derive(Debug)]
pub struct SymbolPng {
    pub png: Vec<u8>,
    pub width: f64,
    pub height: f64,
}

/// Whether this macOS has the SF Symbol APIs (macOS 11+). Checked through
/// the runtime rather than calling them blindly: on older systems the calls
/// would raise "unrecognized selector" instead of letting the webview fall
/// back to its own icon.
#[cfg(target_os = "macos")]
#[must_use]
pub fn sf_symbols_available() -> bool {
    use objc2::runtime::AnyClass;
    use objc2::sel;

    let image = AnyClass::get(c"NSImage");
    let config = AnyClass::get(c"NSImageSymbolConfiguration");
    match (image, config) {
        (Some(image), Some(config)) => {
            image
                .metaclass()
                .responds_to(sel!(imageWithSystemSymbolName:accessibilityDescription:))
                && config
                    .metaclass()
                    .responds_to(sel!(configurationWithPointSize:weight:scale:))
        }
        _ => false,
    }
}

/// # Errors
///
/// Returns an error naming the symbol when macOS doesn't know it, or when
/// drawing or PNG-encoding fails.
#[cfg(target_os = "macos")]
pub fn render_symbol_png(
    name: &str,
    point_size: f64,
    weight: SymbolWeight,
    scale: f64,
) -> Result<SymbolPng, String> {
    use objc2::AllocAnyThread;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSDeviceRGBColorSpace, NSFontWeightMedium,
        NSFontWeightRegular, NSFontWeightSemibold, NSGraphicsContext, NSImage,
        NSImageSymbolConfiguration, NSImageSymbolScale,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSString};

    if !sf_symbols_available() {
        return Err(format!("SF Symbols need macOS 11 or later: {name}"));
    }

    // SAFETY: reading AppKit's immutable font-weight constants.
    let ns_weight = unsafe {
        match weight {
            SymbolWeight::Regular => NSFontWeightRegular,
            SymbolWeight::Medium => NSFontWeightMedium,
            SymbolWeight::Semibold => NSFontWeightSemibold,
        }
    };
    let base = NSImage::imageWithSystemSymbolName_accessibilityDescription(
        &NSString::from_str(name),
        None,
    )
    .ok_or_else(|| format!("unknown SF Symbol: {name}"))?;
    let config = NSImageSymbolConfiguration::configurationWithPointSize_weight_scale(
        point_size,
        ns_weight,
        NSImageSymbolScale::Medium,
    );
    let image = base
        .imageWithSymbolConfiguration(&config)
        .ok_or_else(|| format!("couldn't configure SF Symbol: {name}"))?;
    let size = image.size();

    // Draw into a bitmap of exactly points × scale pixels. (Asking NSImage for
    // a CGImage instead applies the screen's backing scale on top of ours.)
    // SAFETY: null planes make AppKit allocate the buffer; the sizes describe
    // an 8-bit RGBA bitmap; the color-space name is AppKit's own constant.
    let rep = unsafe {
        NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            pixels(size.width, scale),
            pixels(size.height, scale),
            8,
            4,
            true,
            false,
            NSDeviceRGBColorSpace,
            0,
            0,
        )
    }
    .ok_or_else(|| format!("couldn't allocate a bitmap for SF Symbol: {name}"))?;
    rep.setSize(size);
    let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)
        .ok_or_else(|| format!("couldn't create a drawing context for SF Symbol: {name}"))?;
    NSGraphicsContext::saveGraphicsState_class();
    NSGraphicsContext::setCurrentContext(Some(&context));
    image.drawInRect(NSRect::new(NSPoint::new(0.0, 0.0), size));
    context.flushGraphics();
    NSGraphicsContext::restoreGraphicsState_class();

    // SAFETY: an empty properties dictionary is always valid.
    let data = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }
    .ok_or_else(|| format!("couldn't encode SF Symbol as PNG: {name}"))?;
    Ok(SymbolPng {
        png: data.to_vec(),
        width: size.width,
        height: size.height,
    })
}

/// Whole pixels needed to cover `points` at `scale`.
#[cfg(target_os = "macos")]
#[allow(clippy::cast_possible_truncation)] // symbol sizes are tiny and positive
fn pixels(points: f64, scale: f64) -> isize {
    (points * scale).ceil() as isize
}

/// What the `render_symbol` command hands the webview.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolImage {
    png_base64: String,
    width: f64,
    height: f64,
}

/// Tauri command. A sync command, so Tauri runs it on the main thread, which
/// `AppKit` drawing wants.
///
/// # Errors
///
/// See [`render_symbol_png`]; on platforms without SF Symbols it always
/// errors and the frontend draws its own icon instead.
#[tauri::command]
pub fn render_symbol(
    name: &str,
    point_size: f64,
    weight: SymbolWeight,
    scale: f64,
) -> Result<SymbolImage, String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        let png = render_symbol_png(name, point_size, weight, scale)?;
        Ok(SymbolImage {
            png_base64: base64::engine::general_purpose::STANDARD.encode(&png.png),
            width: png.width,
            height: png.height,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (point_size, weight, scale);
        Err(format!("SF Symbols unavailable on this platform: {name}"))
    }
}
