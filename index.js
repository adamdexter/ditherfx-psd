// Dither Effect Pro - Photoshop UXP Plugin
const { app, core, action, imaging } = require("photoshop");
const { executeAsModal } = core;

// ============================================================================
// DITHERING ALGORITHMS
// ============================================================================

const BAYER_4X4 = [
    [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]
].map(row => row.map(v => (v / 16) * 255));

const BAYER_8X8 = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]
].map(row => row.map(v => (v / 64) * 255));

function findClosestColor(r, g, b, palette) {
    let minDist = Infinity, closest = palette[0];
    for (const c of palette) {
        const dist = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
        if (dist < minDist) { minDist = dist; closest = c; }
    }
    return closest;
}

function getPalette(colorMode, customColors = []) {
    switch (colorMode) {
        case 'bw': return [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
        case 'grayscale': return [0, 85, 170, 255].map(v => ({ r: v, g: v, b: v }));
        case 'grayscale8': return [0, 36, 73, 109, 146, 182, 219, 255].map(v => ({ r: v, g: v, b: v }));
        case 'rgb':
            const ws = [];
            for (let r = 0; r <= 255; r += 51)
                for (let g = 0; g <= 255; g += 51)
                    for (let b = 0; b <= 255; b += 51)
                        ws.push({ r, g, b });
            return ws;
        case 'custom':
            return customColors.map(hex => {
                const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
            });
        default: return [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }];
    }
}

function floydSteinberg(pixels, width, height, palette, strength) {
    const errors = new Float32Array(width * height * 3);
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const errIdx = (y * width + x) * 3;
            let r = Math.max(0, Math.min(255, pixels[idx] + errors[errIdx] * factor));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + errors[errIdx + 1] * factor));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + errors[errIdx + 2] * factor));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
            const er = r - nc.r, eg = g - nc.g, eb = b - nc.b;
            if (x + 1 < width) { const n = (y * width + x + 1) * 3; errors[n] += er * 7 / 16; errors[n + 1] += eg * 7 / 16; errors[n + 2] += eb * 7 / 16; }
            if (x > 0 && y + 1 < height) { const n = ((y + 1) * width + x - 1) * 3; errors[n] += er * 3 / 16; errors[n + 1] += eg * 3 / 16; errors[n + 2] += eb * 3 / 16; }
            if (y + 1 < height) { const n = ((y + 1) * width + x) * 3; errors[n] += er * 5 / 16; errors[n + 1] += eg * 5 / 16; errors[n + 2] += eb * 5 / 16; }
            if (x + 1 < width && y + 1 < height) { const n = ((y + 1) * width + x + 1) * 3; errors[n] += er / 16; errors[n + 1] += eg / 16; errors[n + 2] += eb / 16; }
        }
    }
    return pixels;
}

function atkinson(pixels, width, height, palette, strength) {
    const errors = new Float32Array(width * height * 3);
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const errIdx = (y * width + x) * 3;
            let r = Math.max(0, Math.min(255, pixels[idx] + errors[errIdx] * factor));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + errors[errIdx + 1] * factor));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + errors[errIdx + 2] * factor));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
            const er = (r - nc.r) / 8, eg = (g - nc.g) / 8, eb = (b - nc.b) / 8;
            const dist = (dx, dy) => {
                if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
                    const n = ((y + dy) * width + x + dx) * 3;
                    errors[n] += er; errors[n + 1] += eg; errors[n + 2] += eb;
                }
            };
            dist(1, 0); dist(2, 0); dist(-1, 1); dist(0, 1); dist(1, 1); dist(0, 2);
        }
    }
    return pixels;
}

function sierraLite(pixels, width, height, palette, strength) {
    const errors = new Float32Array(width * height * 3);
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const errIdx = (y * width + x) * 3;
            let r = Math.max(0, Math.min(255, pixels[idx] + errors[errIdx] * factor));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + errors[errIdx + 1] * factor));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + errors[errIdx + 2] * factor));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
            const er = r - nc.r, eg = g - nc.g, eb = b - nc.b;
            if (x + 1 < width) { const n = (y * width + x + 1) * 3; errors[n] += er / 2; errors[n + 1] += eg / 2; errors[n + 2] += eb / 2; }
            if (x > 0 && y + 1 < height) { const n = ((y + 1) * width + x - 1) * 3; errors[n] += er / 4; errors[n + 1] += eg / 4; errors[n + 2] += eb / 4; }
            if (y + 1 < height) { const n = ((y + 1) * width + x) * 3; errors[n] += er / 4; errors[n + 1] += eg / 4; errors[n + 2] += eb / 4; }
        }
    }
    return pixels;
}

function stucki(pixels, width, height, palette, strength) {
    const errors = new Float32Array(width * height * 3);
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const errIdx = (y * width + x) * 3;
            let r = Math.max(0, Math.min(255, pixels[idx] + errors[errIdx] * factor));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + errors[errIdx + 1] * factor));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + errors[errIdx + 2] * factor));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
            const er = r - nc.r, eg = g - nc.g, eb = b - nc.b;
            const dist = (dx, dy, w) => {
                if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
                    const n = ((y + dy) * width + x + dx) * 3;
                    errors[n] += er * w / 42; errors[n + 1] += eg * w / 42; errors[n + 2] += eb * w / 42;
                }
            };
            dist(1, 0, 8); dist(2, 0, 4);
            dist(-2, 1, 2); dist(-1, 1, 4); dist(0, 1, 8); dist(1, 1, 4); dist(2, 1, 2);
            dist(-2, 2, 1); dist(-1, 2, 2); dist(0, 2, 4); dist(1, 2, 2); dist(2, 2, 1);
        }
    }
    return pixels;
}

function orderedBayer(pixels, width, height, palette, strength, matrixSize = 4) {
    const matrix = matrixSize === 8 ? BAYER_8X8 : BAYER_4X4;
    const size = matrix.length;
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const bv = matrix[y % size][x % size] - 128;
            let r = Math.max(0, Math.min(255, pixels[idx] + bv * factor));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + bv * factor));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + bv * factor));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
        }
    }
    return pixels;
}

function randomNoise(pixels, width, height, palette, strength) {
    const factor = strength / 100;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const noise = (Math.random() - 0.5) * 255 * factor;
            let r = Math.max(0, Math.min(255, pixels[idx] + noise));
            let g = Math.max(0, Math.min(255, pixels[idx + 1] + noise));
            let b = Math.max(0, Math.min(255, pixels[idx + 2] + noise));
            const nc = findClosestColor(r, g, b, palette);
            pixels[idx] = nc.r; pixels[idx + 1] = nc.g; pixels[idx + 2] = nc.b;
        }
    }
    return pixels;
}

function halftone(pixels, width, height, palette, strength, dotSize = 4, angle = 45) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const rx = x * cos - y * sin, ry = x * sin + y * cos;
            const cx = ((rx % dotSize) + dotSize) % dotSize - dotSize / 2;
            const cy = ((ry % dotSize) + dotSize) % dotSize - dotSize / 2;
            const dist = Math.sqrt(cx * cx + cy * cy) / (dotSize / 2);
            const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            const thresh = (1 - lum / 255) * (strength / 100);
            if (dist < thresh) { pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; }
            else { pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; }
        }
    }
    return pixels;
}

function tileGlitch(pixels, width, height, tileSize = 8, severity = 50, mangle = 0) {
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    const totalTiles = tilesX * tilesY;

    // Create a copy of the original pixels for reading source tiles
    const original = new Uint8Array(pixels);

    // Seeded random for reproducible-ish results within a single apply
    const random = () => Math.random();

    // Build list of all tile positions
    const tilePositions = [];
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            tilePositions.push({ tx, ty });
        }
    }

    // Create a shuffled mapping for tile swapping based on severity
    const tileMapping = [...tilePositions];
    const severityFactor = severity / 100;

    // Shuffle tiles based on severity - higher severity = more randomization
    for (let i = tileMapping.length - 1; i > 0; i--) {
        if (random() < severityFactor) {
            const j = Math.floor(random() * (i + 1));
            [tileMapping[i], tileMapping[j]] = [tileMapping[j], tileMapping[i]];
        }
    }

    // Mangle effects for tile distortion
    const mangleFactor = mangle / 100;

    // Apply glitch patterns similar to 8-bit/16-bit hardware glitches
    const glitchEffects = [
        // Bit shift - simulates VRAM addressing errors
        (r, g, b, a, x, y) => {
            const shift = Math.floor(random() * 3) + 1;
            return [(r << shift) & 255, (g >> shift) & 255, (b << shift) & 255, a];
        },
        // Channel swap - simulates palette corruption
        (r, g, b, a, x, y) => {
            const swaps = [[g, b, r], [b, r, g], [r, b, g], [g, r, b], [b, g, r]];
            const swap = swaps[Math.floor(random() * swaps.length)];
            return [swap[0], swap[1], swap[2], a];
        },
        // XOR noise - simulates bit errors in VRAM
        (r, g, b, a, x, y) => {
            const noise = Math.floor(random() * 256);
            return [r ^ noise, g ^ noise, b ^ noise, a];
        },
        // Posterize - simulates reduced color depth
        (r, g, b, a, x, y) => {
            const levels = [2, 4, 8][Math.floor(random() * 3)];
            const step = 255 / (levels - 1);
            return [
                Math.round(Math.round(r / step) * step),
                Math.round(Math.round(g / step) * step),
                Math.round(Math.round(b / step) * step),
                a
            ];
        },
        // Scanline offset - simulates timing errors
        (r, g, b, a, x, y) => {
            const offset = (y % 2 === 0) ? 50 : -50;
            return [
                Math.max(0, Math.min(255, r + offset)),
                Math.max(0, Math.min(255, g + offset)),
                Math.max(0, Math.min(255, b + offset)),
                a
            ];
        },
        // Color crush - simulates overflow/underflow
        (r, g, b, a, x, y) => {
            const crush = (v) => {
                const crushed = v * 1.5;
                return crushed > 255 ? 255 - (crushed - 255) : crushed;
            };
            return [Math.floor(crush(r)), Math.floor(crush(g)), Math.floor(crush(b)), a];
        }
    ];

    // Process each tile
    for (let tileIdx = 0; tileIdx < totalTiles; tileIdx++) {
        const destTile = tilePositions[tileIdx];
        const srcTile = tileMapping[tileIdx];

        const destX = destTile.tx * tileSize;
        const destY = destTile.ty * tileSize;
        const srcX = srcTile.tx * tileSize;
        const srcY = srcTile.ty * tileSize;

        // Determine if this tile should be mangled
        const shouldMangle = random() < mangleFactor;
        const glitchEffect = shouldMangle ? glitchEffects[Math.floor(random() * glitchEffects.length)] : null;

        // Additional mangle: sometimes duplicate rows or columns within a tile
        const rowGlitch = shouldMangle && random() < 0.3;
        const colGlitch = shouldMangle && random() < 0.3;
        const glitchRow = Math.floor(random() * tileSize);
        const glitchCol = Math.floor(random() * tileSize);

        // Copy tile from source to destination with optional effects
        for (let py = 0; py < tileSize; py++) {
            for (let px = 0; px < tileSize; px++) {
                const actualDestX = destX + px;
                const actualDestY = destY + py;

                if (actualDestX >= width || actualDestY >= height) continue;

                // Apply row/column duplication glitch
                let readPy = py;
                let readPx = px;
                if (rowGlitch && py > glitchRow) {
                    readPy = glitchRow; // Repeat a row
                }
                if (colGlitch && px > glitchCol) {
                    readPx = glitchCol; // Repeat a column
                }

                let actualSrcX = srcX + readPx;
                let actualSrcY = srcY + readPy;

                // Clamp to image bounds
                actualSrcX = Math.min(actualSrcX, width - 1);
                actualSrcY = Math.min(actualSrcY, height - 1);

                const srcIdx = (actualSrcY * width + actualSrcX) * 4;
                const destIdx = (actualDestY * width + actualDestX) * 4;

                let r = original[srcIdx];
                let g = original[srcIdx + 1];
                let b = original[srcIdx + 2];
                let a = original[srcIdx + 3];

                // Apply glitch effect if mangling this tile
                if (glitchEffect) {
                    [r, g, b, a] = glitchEffect(r, g, b, a, px, py);
                }

                pixels[destIdx] = r;
                pixels[destIdx + 1] = g;
                pixels[destIdx + 2] = b;
                pixels[destIdx + 3] = a;
            }
        }
    }

    return pixels;
}

// Downscale image by averaging pixels
function downscale(pixels, width, height, scale) {
    const newWidth = Math.max(1, Math.floor(width / scale));
    const newHeight = Math.max(1, Math.floor(height / scale));
    const result = new Uint8Array(newWidth * newHeight * 4);
    
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            let r = 0, g = 0, b = 0, a = 0, count = 0;
            
            // Average the pixels in this block
            for (let dy = 0; dy < scale && (y * scale + dy) < height; dy++) {
                for (let dx = 0; dx < scale && (x * scale + dx) < width; dx++) {
                    const srcIdx = ((y * scale + dy) * width + (x * scale + dx)) * 4;
                    r += pixels[srcIdx];
                    g += pixels[srcIdx + 1];
                    b += pixels[srcIdx + 2];
                    a += pixels[srcIdx + 3];
                    count++;
                }
            }
            
            const dstIdx = (y * newWidth + x) * 4;
            result[dstIdx] = Math.round(r / count);
            result[dstIdx + 1] = Math.round(g / count);
            result[dstIdx + 2] = Math.round(b / count);
            result[dstIdx + 3] = Math.round(a / count);
        }
    }
    
    return { pixels: result, width: newWidth, height: newHeight };
}

// Upscale image using nearest neighbor (keeps the chunky pixel look)
function upscale(pixels, width, height, targetWidth, targetHeight) {
    const result = new Uint8Array(targetWidth * targetHeight * 4);
    
    const scaleX = width / targetWidth;
    const scaleY = height / targetHeight;
    
    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            const srcX = Math.min(Math.floor(x * scaleX), width - 1);
            const srcY = Math.min(Math.floor(y * scaleY), height - 1);
            const srcIdx = (srcY * width + srcX) * 4;
            const dstIdx = (y * targetWidth + x) * 4;
            
            result[dstIdx] = pixels[srcIdx];
            result[dstIdx + 1] = pixels[srcIdx + 1];
            result[dstIdx + 2] = pixels[srcIdx + 2];
            result[dstIdx + 3] = pixels[srcIdx + 3];
        }
    }
    
    return result;
}

// ============================================================================
// PHOTOSHOP INTEGRATION
// ============================================================================

async function applyDither(options) {
    const { algorithm, colorMode, customColors, strength, preserveTransparency, dotSize, angle, scale, limitImageSize, tileSize, severity, mangle } = options;
    
    // Validate document and layer
    const doc = app.activeDocument;
    if (!doc) {
        throw new Error("Please open a document first");
    }
    
    const layer = doc.activeLayers[0];
    if (!layer) {
        throw new Error("Please select a layer");
    }
    
    // Check for imaging API
    if (!imaging) {
        throw new Error("Imaging API not available. Check manifest apiVersion.");
    }
    
    console.log("Getting pixels from layer:", layer.name, "id:", layer.id);
    console.log("Document:", doc.name, "id:", doc.id, "size:", doc.width, "x", doc.height);
    
    // Get pixel data - don't specify targetSize to get actual pixels
    const pixelData = await imaging.getPixels({
        documentID: doc.id,
        layerID: layer.id,
        colorSpace: "RGB",
        componentSize: 8
    });
    
    if (!pixelData || !pixelData.imageData) {
        throw new Error("Failed to get pixel data from layer");
    }
    
    const imageData = pixelData.imageData;
    let pixels = await imageData.getData();
    const originalWidth = imageData.width;
    const originalHeight = imageData.height;
    const components = imageData.components;
    
    // Get the source bounds for putting pixels back
    const sourceBounds = pixelData.sourceBounds;
    console.log(`Processing ${originalWidth}x${originalHeight} image, ${components} components, scale: ${scale}x`);
    console.log("Source bounds:", JSON.stringify(sourceBounds));
    
    // Safety check for very large images (if enabled)
    const maxPixels = 50000000; // 50 megapixels
    if (limitImageSize && originalWidth * originalHeight > maxPixels) {
        throw new Error(`Image too large (${originalWidth}x${originalHeight}). Maximum: ~${Math.sqrt(maxPixels).toFixed(0)}x${Math.sqrt(maxPixels).toFixed(0)}px. Disable limit in settings to override.`);
    }
    
    // If not 4 components (RGBA), we need to handle differently
    if (components !== 4) {
        throw new Error(`Unexpected pixel format: ${components} components. Expected 4 (RGBA).`);
    }
    
    // Store original alpha if preserving transparency
    let originalAlpha = null;
    if (preserveTransparency) {
        originalAlpha = new Uint8Array(originalWidth * originalHeight);
        for (let i = 0; i < originalWidth * originalHeight; i++) {
            originalAlpha[i] = pixels[i * 4 + 3];
        }
    }
    
    // Working dimensions (may be scaled down)
    let workWidth = originalWidth;
    let workHeight = originalHeight;
    let workPixels = pixels;
    
    // Downscale if scale > 1
    if (scale > 1) {
        console.log(`Downscaling by ${scale}x...`);
        const scaled = downscale(pixels, originalWidth, originalHeight, scale);
        workPixels = scaled.pixels;
        workWidth = scaled.width;
        workHeight = scaled.height;
        console.log(`Working size: ${workWidth}x${workHeight}`);
        
        // Help GC by clearing reference if we made a copy
        if (workPixels !== pixels) {
            pixels = null;
        }
    }
    
    // Get palette and apply algorithm
    const palette = getPalette(colorMode, customColors);
    
    console.log("Applying algorithm:", algorithm);
    
    switch (algorithm) {
        case 'floyd-steinberg': floydSteinberg(workPixels, workWidth, workHeight, palette, strength); break;
        case 'atkinson': atkinson(workPixels, workWidth, workHeight, palette, strength); break;
        case 'ordered-bayer': orderedBayer(workPixels, workWidth, workHeight, palette, strength, 4); break;
        case 'ordered-bayer8': orderedBayer(workPixels, workWidth, workHeight, palette, strength, 8); break;
        case 'random': randomNoise(workPixels, workWidth, workHeight, palette, strength); break;
        case 'halftone': halftone(workPixels, workWidth, workHeight, palette, strength, dotSize, angle); break;
        case 'sierra': sierraLite(workPixels, workWidth, workHeight, palette, strength); break;
        case 'stucki': stucki(workPixels, workWidth, workHeight, palette, strength); break;
        case 'tile-glitch': tileGlitch(workPixels, workWidth, workHeight, tileSize, severity, mangle); break;
        default: floydSteinberg(workPixels, workWidth, workHeight, palette, strength);
    }
    
    // Upscale back to original size if we downscaled
    let finalPixels;
    if (scale > 1) {
        console.log(`Upscaling back to ${originalWidth}x${originalHeight}...`);
        finalPixels = upscale(workPixels, workWidth, workHeight, originalWidth, originalHeight);
        // Clear working pixels reference
        workPixels = null;
    } else {
        finalPixels = workPixels;
    }
    
    // Restore original alpha if preserving transparency
    if (preserveTransparency && originalAlpha) {
        for (let i = 0; i < originalWidth * originalHeight; i++) {
            finalPixels[i * 4 + 3] = originalAlpha[i];
        }
        // Clear alpha reference
        originalAlpha = null;
    }
    
    console.log("Putting pixels back...");
    
    // Put pixels back using the same bounds we got them from
    let newImageData;
    try {
        newImageData = await imaging.createImageDataFromBuffer(finalPixels, {
            width: originalWidth,
            height: originalHeight,
            components: 4,
            colorSpace: "RGB",
            componentSize: 8
        });
        
        await imaging.putPixels({
            documentID: doc.id,
            layerID: layer.id,
            imageData: newImageData,
            targetBounds: sourceBounds,
            replace: true
        });
    } finally {
        // Explicit cleanup
        finalPixels = null;
        newImageData = null;
    }
    
    console.log("Done!");
}

// ============================================================================
// UI INITIALIZATION - Wait for DOM
// ============================================================================

function initUI() {
    const status = document.getElementById("status");
    
    // Algorithm descriptions for tooltips
    const algorithmDescriptions = {
        'floyd-steinberg': 'Classic error diffusion. Best for general purpose, smooth gradients.',
        'atkinson': 'Mac classic style, high contrast. Best for retro look, 1-bit graphics.',
        'ordered-bayer': '4x4 threshold pattern. Best for game graphics, consistent patterns.',
        'ordered-bayer8': '8x8 threshold pattern. Best for smoother patterns on larger images.',
        'random': 'Random threshold per pixel. Best for stipple, grain, film effects.',
        'halftone': 'Circular dot pattern. Best for print simulation, pop art style.',
        'sierra': 'Fast 2-neighbor diffusion. Best for quick processing, decent quality.',
        'stucki': '12-neighbor diffusion. Best for high quality, subtle gradients.',
        'tile-glitch': '8/16-bit style tile corruption. Best for retro game glitch effects.'
    };
    
    // Settings toggle
    document.getElementById("settingsToggle").addEventListener("click", () => {
        document.getElementById("settingsPane").classList.toggle("hidden");
    });
    
    // Algorithm tooltip update
    document.getElementById("algorithm").addEventListener("change", e => {
        document.getElementById("algorithmTooltip").textContent =
            algorithmDescriptions[e.target.value] || '';
        document.getElementById("halftoneOptions").style.display =
            e.target.value === "halftone" ? "block" : "none";
        document.getElementById("tileGlitchOptions").style.display =
            e.target.value === "tile-glitch" ? "block" : "none";
    });
    
    // Slider value displays
    document.getElementById("strength").addEventListener("input", e => {
        document.getElementById("strengthValue").textContent = e.target.value;
    });
    
    document.getElementById("scale").addEventListener("input", e => {
        document.getElementById("scaleValue").textContent = e.target.value;
    });
    
    document.getElementById("dotSize").addEventListener("input", e => {
        document.getElementById("dotSizeValue").textContent = e.target.value;
    });
    
    document.getElementById("angle").addEventListener("input", e => {
        document.getElementById("angleValue").textContent = e.target.value;
    });

    document.getElementById("tileSize").addEventListener("input", e => {
        document.getElementById("tileSizeValue").textContent = e.target.value;
    });

    document.getElementById("severity").addEventListener("input", e => {
        document.getElementById("severityValue").textContent = e.target.value;
    });

    document.getElementById("mangle").addEventListener("input", e => {
        document.getElementById("mangleValue").textContent = e.target.value;
    });

    // Show/hide sections
    document.getElementById("colorMode").addEventListener("change", e => {
        document.getElementById("customPaletteSection").style.display = 
            e.target.value === "custom" ? "block" : "none";
    });
    
    // Apply button
    document.getElementById("applyBtn").addEventListener("click", async () => {
        status.textContent = "Processing...";
        status.className = "processing";
        
        try {
            await executeAsModal(async () => {
                const customColors = Array.from(document.querySelectorAll(".palette-color")).map(i => i.value);
                await applyDither({
                    algorithm: document.getElementById("algorithm").value,
                    colorMode: document.getElementById("colorMode").value,
                    customColors: customColors,
                    strength: parseInt(document.getElementById("strength").value),
                    scale: parseInt(document.getElementById("scale").value),
                    preserveTransparency: document.getElementById("preserveTransparency").checked,
                    dotSize: parseInt(document.getElementById("dotSize").value),
                    angle: parseInt(document.getElementById("angle").value),
                    limitImageSize: document.getElementById("limitImageSize").checked,
                    tileSize: parseInt(document.getElementById("tileSize").value),
                    severity: parseInt(document.getElementById("severity").value),
                    mangle: parseInt(document.getElementById("mangle").value)
                });
            }, { commandName: "Apply Dither" });
            
            status.textContent = "Effect applied!";
            status.className = "success";
        } catch (err) {
            console.error("Dither error:", err);
            status.textContent = "Error: " + (err.message || String(err));
            status.className = "error";
        }
    });
    
    // Undo button
    document.getElementById("undoBtn").addEventListener("click", async () => {
        try {
            await executeAsModal(async () => {
                await action.batchPlay([{ _obj: "undo" }], {});
            }, { commandName: "Undo" });
            status.textContent = "Undone.";
            status.className = "";
        } catch (err) {
            console.error("Undo error:", err);
            status.textContent = "Error: " + (err.message || String(err));
            status.className = "error";
        }
    });
    
    status.textContent = "Ready. Open a document, select a layer, click Apply.";
    console.log("Dither Effect Pro initialized");
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
} else {
    initUI();
}
