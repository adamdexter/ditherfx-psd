# Dither Effect Pro

A UXP plugin for Adobe Photoshop that applies classic dithering algorithms to your images. Create retro, pixel-art, and stylized effects with precise control.

![Photoshop Version](https://img.shields.io/badge/Photoshop-2022%2B%20(v23.3%2B)-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **8 Dithering Algorithms**
  - Floyd-Steinberg (classic error diffusion)
  - Atkinson (Mac classic aesthetic)
  - Ordered Bayer 4x4 & 8x8 (crosshatch patterns)
  - Random Noise (stipple effect)
  - Halftone (print-style dots)
  - Sierra Lite (fast error diffusion)
  - Stucki (high-quality error diffusion)

- **5 Color Modes**
  - Black & White
  - Grayscale (4 or 8 levels)
  - RGB Web Safe (216 colors)
  - Custom Palette (6 user-defined colors)

- **Additional Controls**
  - Strength slider (0-100%)
  - Scale slider (1-16x) for chunky pixel effects on high-res images
  - Preserve Transparency option
  - Halftone-specific dot size and angle controls

## Installation

### Via UXP Developer Tool (Development)

1. Download or clone this repository
2. Open Adobe Photoshop 2022 or later
3. Go to **Plugins → Development → UXP Developer Tool**
4. Click **Add Plugin** and select the `manifest.json` file
5. Click **Load** to activate the plugin

### Prerequisites

Make sure these Photoshop settings are enabled:
- **Edit → Preferences → Plugins → Enable Developer Mode** ✓
- **Edit → Preferences → Plugins → Enable Generator** ✓

## Usage

1. Open an image in Photoshop
2. Select the layer you want to dither
3. Open **Plugins → Dither Effect Pro**
4. Choose your algorithm and color mode
5. Adjust strength and scale as desired
6. Click **Apply Dither**
7. Use **Undo** or Ctrl/Cmd+Z to revert

### Tips

- **High-resolution images:** Use the Scale slider to create visible dither patterns. Scale 4-8x works well for most HD images.
- **Retro game look:** Use Ordered Bayer with Black & White or limited Grayscale
- **Mac classic style:** Atkinson algorithm with Black & White
- **Print effect:** Halftone with adjusted dot size and angle
- **Custom palettes:** Select "Custom Palette" color mode to use your own 6-color palette

## Settings

Click the ⚙️ gear icon to access settings:

- **Limit image size to 50 MP** - Enabled by default. Prevents memory exhaustion when processing very large images. Disable at your own risk for images larger than ~7000x7000 pixels.

## Requirements

- Adobe Photoshop 2022 (v23.3) or later
- macOS or Windows

## Known Issues

- Very large images (>50 megapixels) may cause instability or crashes
- Processing time increases with image size and scale factor
- Smart Objects should be rasterized before applying the effect

## Development

See [devlog-history.md](devlog-history.md) for detailed development history and technical decisions.

### Building from Source

No build step required - this is a pure UXP plugin with vanilla JavaScript.

### File Structure

```
photoshop-dither-plugin/
├── manifest.json        # UXP plugin configuration
├── index.html           # Plugin UI
├── index.js             # Plugin logic and algorithms
├── README.md            # This file
└── devlog-history.md    # Development history (for contributors)
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with UXP Developer Tool
5. Submit a pull request

## Algorithm Details

| Algorithm | Type | Best For |
|-----------|------|----------|
| Floyd-Steinberg | Error diffusion | General purpose, smooth gradients |
| Atkinson | Error diffusion | High contrast, retro Mac look |
| Ordered Bayer | Threshold matrix | Patterns, game graphics |
| Random Noise | Random threshold | Stipple, grain effects |
| Halftone | Pattern-based | Print simulation |
| Sierra Lite | Error diffusion | Fast processing |
| Stucki | Error diffusion | High quality, subtle |

## License

MIT License - feel free to use, modify, and distribute.

## Credits

Developed with assistance from Claude (Anthropic).

## Changelog

### v1.0.0
- Initial release
- 8 dithering algorithms
- 5 color modes including custom palette
- Scale feature for high-res images
- Memory safety limits with toggle
- Settings panel
