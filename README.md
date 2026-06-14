# Howard the Chronicler

A visual storytelling module for **Foundry VTT**. Build comic-style tale pages with panels, image layers, speech bubbles, and skill markers — then present them to your players page by page with dramatic reveals, project them onto a Theater canvas, or export the whole tale to PDF.

## Features

- **Comic book tale builder** — pages with image layers, freeform panels, speech bubbles, and rich text blocks
- **Presentation mode** — broadcast tales to your players, reveal elements one at a time, zoom into panels
- **Theater canvas projection** — display the current page directly on the canvas as a dedicated layer
- **Hidden elements and pages** — keep parts of a tale concealed and reveal them when the moment is right
- **Skill checks built into pages** — place skill markers, players roll, success/fail outcomes
- **PDF / print export** — export a tale (optionally with GM notes) to a self-contained HTML file you print or save as PDF
- **System-agnostic** — designed to work alongside any game system

## Installation

Foundry VTT → **Add-on Modules** → **Install Module** → paste this manifest URL:

```
https://raw.githubusercontent.com/antoniosantos8520-cyber/Howard-the-Chronicler/main/module.json
```

Enable in your world's **Manage Modules** settings.

## Exporting to PDF

Open a tale and use the **Export** button. A self-contained `.html` file downloads — all images are embedded, so it prints correctly even offline. Open it in your browser and click **Print / Save PDF**.

For an edge-to-edge result with no white border, the export defaults the print dialog to **Tabloid** paper with **no margins** (Tabloid's proportions closely match the comic page). If your browser remembers a different paper size, set **Paper size → Tabloid** and **Margins → None** in the print dialog — the on-screen export page reminds you of this. Text and artwork scale together at any paper size, so the output matches what you see in the editor.

## Compatibility

- **Foundry VTT**: v13 minimum, verified on v14
- **Works with**: any game system

## Changelog

### v0.2.0

- Added the Theater canvas projection layer.
- PDF / print export overhaul:
  - Images inlined as base64 so exported files are self-contained.
  - Speech-bubble tails, text blocks, fonts (Comic Neue / Bangers), clipping, and positions now match the editor exactly.
  - Each page scales to fill the sheet; fonts and padding scale with it, so output is consistent across A4 / A5 / Letter / Tabloid.
  - Defaults to Tabloid / no margins for an edge-to-edge fit.
- Module id is now `howard-the-chronicler`.

### v0.1.0

- Initial release: comic tale builder, presentation mode, hidden elements/pages, and skill checks.

## License

No license file is included yet, so all rights are reserved by default. Contact the author for reuse.
