# Dither Effect Pro - Development History

> This document is optimized for AI agents (Claude Code) to understand the development history, debugging journey, and architectural decisions made during this project.

## Project Overview

**Dither Effect Pro** is a UXP plugin for Adobe Photoshop 2026 (v27.2.0) that applies various dithering algorithms to images. It uses the Photoshop Imaging API for direct pixel manipulation.

## Development Timeline

### Phase 1: Initial Plugin Setup

**Goal:** Create a basic UXP plugin structure that loads in Photoshop.

**Challenges Encountered:**
1. "Load command failed" errors in UXP Developer Tool
2. Multiple manifest.json version attempts (v6, v5, v4)

**Solution:**
- Manifest v4 format with host as object (not array) worked
- `minVersion: "22.0.0"` initially
- **Critical discovery:** User needed to enable BOTH "Developer Mode" AND "Enable Generator" in Photoshop → Edit → Preferences → Plugins

**Working manifest structure (v4):**
```json
{
    "manifestVersion": 4,
    "id": "com.dither.effect.pro",
    "name": "Dither Effect",
    "version": "1.0.0",
    "host": {
        "app": "PS",
        "minVersion": "23.3.0",
        "data": {
            "apiVersion": 2
        }
    },
    ...
}
```

### Phase 2: Imaging API Access Issues

**Problem:** Plugin loaded but showed "Imaging API not available. Requires PS 23.3+" despite running PS 27.2.0.

**Root Cause:** Two issues:
1. Incorrect `require` pattern for imaging API
2. Missing `apiVersion: 2` in manifest

**What DIDN'T work:**
```javascript
const photoshop = require("photoshop");
const imaging = photoshop.imaging; // undefined!
```

**What WORKED:**
```javascript
const { app, core, action, imaging } = require("photoshop");
```

**Manifest fix:** Added `apiVersion: 2` to `host.data`:
```json
"host": {
    "app": "PS",
    "minVersion": "23.3.0",
    "data": {
        "apiVersion": 2
    }
}
```

### Phase 3: Image Distortion Bug

**Problem:** Dithering worked but output was distorted - images were warped, cut, and replicated across the canvas.

**Root Cause:** Using `targetSize` in `getPixels()` forced resize, and `targetBounds` in `putPixels()` didn't match actual layer bounds.

**What DIDN'T work:**
```javascript
const pixelData = await imaging.getPixels({
    documentID: doc.id,
    layerID: layer.id,
    targetSize: { width: doc.width, height: doc.height }, // WRONG!
    ...
});

await imaging.putPixels({
    ...
    targetBounds: { left: 0, top: 0, right: doc.width, bottom: doc.height } // WRONG!
});
```

**What WORKED:**
```javascript
// Don't specify targetSize - get actual pixels
const pixelData = await imaging.getPixels({
    documentID: doc.id,
    layerID: layer.id,
    colorSpace: "RGB",
    componentSize: 8
});

// Use the sourceBounds returned by getPixels
const sourceBounds = pixelData.sourceBounds;

await imaging.putPixels({
    ...
    targetBounds: sourceBounds, // Use actual bounds!
    replace: true
});
```

### Phase 4: Scale Feature (Chunky Pixels)

**Problem:** Dithering at pixel level was too subtle on high-resolution images.

**Solution:** Added downscale → dither → upscale pipeline:
1. Downscale image by scale factor (averaging pixels)
2. Apply dithering algorithm to smaller image
3. Upscale back using nearest-neighbor (preserves hard pixel edges)

**Key functions added:**
- `downscale(pixels, width, height, scale)` - averages pixel blocks
- `upscale(pixels, width, height, targetWidth, targetHeight)` - nearest-neighbor

### Phase 5: Crash Prevention

**Problem:** Intermittent Photoshop crashes (SIGSEGV) when processing large images, especially with high scale values.

**Crash analysis:** 
- `EXC_BAD_ACCESS (SIGSEGV)` with "possible pointer authentication failure"
- Crash occurred in Photoshop's native code, not JavaScript
- Triggered by memory pressure from multiple large Uint8Arrays

**Mitigations implemented:**
1. **50 megapixel limit** (toggleable in settings)
2. **Explicit memory cleanup** - null out references after use
3. **try/finally blocks** for cleanup even on errors
4. **Better variable management** - avoid holding multiple copies

```javascript
// Help GC by clearing references
if (workPixels !== pixels) {
    pixels = null;
}

// In finally block
finalPixels = null;
newImageData = null;
```

## Architecture

### File Structure
```
photoshop-dither-plugin/
├── manifest.json    # UXP plugin manifest (v4 format)
├── index.html       # Plugin UI
├── index.js         # All plugin logic
├── README.md        # User documentation
└── devlog-history.md # This file
```

### Dithering Algorithms Implemented

| Algorithm | Type | Distribution | Best For |
|-----------|------|--------------|----------|
| Floyd-Steinberg | Error diffusion | 7/16, 3/16, 5/16, 1/16 to 4 neighbors | General purpose, smooth gradients |
| Atkinson | Error diffusion | 1/8 to 6 neighbors (loses 1/4 of error) | High contrast, retro Mac look |
| Ordered Bayer 4x4 | Threshold matrix | 16-level pattern | Patterns, game graphics, small images |
| Ordered Bayer 8x8 | Threshold matrix | 64-level pattern | Smoother patterns, larger images |
| Random Noise | Random threshold | Per-pixel random | Stipple, grain, film effects |
| Halftone | Pattern-based | Circular dots | Print simulation, pop art |
| Sierra Lite | Error diffusion | 2/4, 1/4 to 2 neighbors | Fast processing, decent quality |
| Stucki | Error diffusion | Weights to 12 neighbors | High quality, subtle gradients |

### Color Modes
- Black & White (2 colors)
- Grayscale 4 levels
- Grayscale 8 levels
- RGB Web Safe (216 colors)
- Custom Palette (6 user-defined colors)

### Key Technical Details

**Pixel format:** RGBA, 4 components, 8-bit per channel, Uint8Array

**executeAsModal:** Required for all Photoshop document modifications
```javascript
await executeAsModal(async () => {
    // Photoshop operations here
}, { commandName: "Apply Dither" });
```

**Undo support:** Uses `app.activeDocument.closeWithoutSaving()` workaround isn't viable; relies on Photoshop's built-in undo via `require("photoshop").action.batchPlay`

## Known Limitations

1. **Memory:** Very large images (>50MP) can cause instability
2. **Layer types:** Works best on raster layers; smart objects may need rasterization
3. **Color space:** Assumes RGB; CMYK/Lab not tested
4. **Performance:** JavaScript pixel manipulation is slower than native filters

## Future Improvements to Consider

1. Web Worker for non-blocking processing
2. Progress indicator for large images
3. Preview mode before applying
4. Batch processing multiple layers
5. Preset save/load system
6. More color palette options
7. Integration with Photoshop's history states

## Debugging Tips for Future Development

1. **Console logging:** Use UXP Developer Tool console
2. **Check bounds:** Always log `sourceBounds` when debugging position issues
3. **Memory issues:** Watch for crashes after multiple operations
4. **API changes:** Adobe may change imaging API between versions
5. **Manifest issues:** Try manifest v4 format first; v5/v6 had issues

## Environment Tested

- **Photoshop:** 2026 v27.2.0
- **macOS:** 15.7.2 (Apple Silicon M4 Pro)
- **UXP:** Built-in to PS 27.2.0
