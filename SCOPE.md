# Howard the Chronicler — Full Module Scope

**Version:** 0.2.0
**Platform:** Foundry VTT v13+
**Author:** Anton
**License:** Free

---

## What It Is

Howard the Chronicler is a visual storytelling and session delivery tool for Foundry VTT. It lets a GM or creator build a complete, playable Tale — combining comic-style pages, combat scenes, enemies, skill checks, and GM notes into a single portable artifact that can be exported, shared, and imported into any Foundry world with Howard installed.

The aesthetic is comic book. The purpose is tabletop roleplay. The philosophy is: the comic IS the session prep, the session recap, and the session itself.

---

## Core Concepts

### The Tale
A Tale is the top-level container. It has:
- A title and issue number
- A cover image
- One or more Pages
- Per-page GM data (fight scene, actors, checks, notes)

Multiple Tales live in a single Howard actor (singleton, auto-created). Tales are displayed in the **Rack** — a horizontal carousel on first open.

### The Page
A page is a comic-book canvas containing any combination of:
- A background image
- Page-level image layers (full-bleed, layered, independently positioned)
- Freeform panels (rectangles with their own image layers)
- Text blocks (caption boxes)
- Speech bubbles
- Skill check markers

All elements are positioned as percentages of the page, making them resolution-independent.

### The Rack
The opening view. Shows all Tales as cover cards in a swipeable horizontal carousel. From here the GM can:
- Create a new Tale
- Delete a Tale
- Edit Tale info (title, issue number, cover image)
- Export a Tale as a `.htale` file
- Import a `.htale` file
- Open a Tale into the Reader

---

## File Structure

```
howard-the-chronicler/
├── module.json
├── SCOPE.md
├── module/
│   ├── howard-init.js          # Foundry hooks, actor/scene auto-creation, broadcast listeners
│   ├── howard-sheet.js         # Main ActorSheet (~5700+ lines) — all UI, tools, and logic
│   └── howard-the-chronicler-layer.js  # PIXI canvas layer for Theater mode
├── templates/
│   └── howard-sheet.hbs        # Handlebars template for the full sheet UI
├── css/
│   └── howard.css              # All styles (~5000+ lines)
├── images/
│   └── howard.png              # Default Howard avatar
└── lang/
    └── en.json                 # Localisation strings
```

---

## The Sheet — Three Modes

### 1. Rack Mode
Default view on open. Carousel of Tale covers. Navigation, creation, deletion, export/import.

### 2. Reader / Editor Mode (GM)
Opens when a Tale is selected. Three-column layout:
- **Left:** Page strip (numbered page thumbnails, right-click to hide/show pages from players)
- **Center:** The comic page canvas
- **Right:** GM Panel (GM mode) or Forge Panel (Forge mode)

The top bar has mode controls: Forge tool selector, Play/Presentation mode toggle, Theater button.

### 3. Player Mode
Stripped-down read-only view. No right panel. No forge tools. Pages revealed progressively by GM. Positioned top-left of screen at 275×440px by default.

---

## The Forge — Building Tools

Accessed via the right panel in Forge mode. Four tools:

### Page Tool
- Set page background image
- Add/remove page-level image layers
- Each image layer: position (% x/y), layer order (z-index), move/resize on canvas
- Lock/unlock to prevent accidental edits

### Panel Tool
- Draw freeform rectangles on the page canvas
- Each panel: x/y/width/height as % of page
- Per-panel image layers with independent position, zoom, fit
- Panel border color, border width, background color, transparency toggle
- Copy/duplicate panel (stamp out identical panels)
- Z-index control (layer order)
- Move and resize on canvas
- Lock/unlock

### Text Tool
- Draw freeform text block rectangles on canvas
- Content: free-form text, edited inline in Forge panel
- Font: Comic Neue Bold (comic caption style)
- Font size: adjustable via +/− buttons or Shift+scroll in editor (range 6–72px)
- Style: caption (dark background) or transparent (no background/border)
- Z-index, move, resize, lock

### Speech Tool
- Draw speech bubble rectangles on canvas
- White rounded rect with pointer tail
- Tail position: bottom-left, bottom-center, bottom-right, top-left, top-right, left, right
- Content: free-form text, edited inline in Forge panel
- Font: Bangers (comic speech style)
- Font size: adjustable via +/− buttons or Shift+scroll (range 6–72px)
- Z-index, move, resize, aim (reposition tail tip by clicking page)

---

## The GM Panel

Per-page operational data. Visible in GM mode (right panel). Does not appear for players.

### FIGHT
Dropdown of all scenes in the world. Stores a `combatScene` reference on the page. One click from the story to the fight.

### Actors
Tag-based enemy/NPC list per page.
- Add by name (looks up Blood & Steel enemy categories) or drag from actor sidebar
- Drag tagged actors directly to the canvas
- Supports B&S category-based enemies (draggable, opens Albert lookup) and UUID-linked actors (draggable, opens sheet)
- Enemy data auto-detected from `systems/conan/data/enemies.json` on module load

### Checks
Skill check markers placed on the page canvas.
- DC, skill name, description
- Move marker to any position on the page
- Click marker to fire the check (sends to chat)
- Fired state tracked visually

### Notes
Per-page title and freeform notes textarea for anything that doesn't fit above.

---

## Presentation Mode (Play Mode)

Entered via the Present button in the top bar. Shrinks the sheet to 460×720px (no right panel). The GM sees the page with per-element eye icons.

### Reveal System
- Every panel, text block, and speech bubble has an eye icon in presentation mode
- Click eye: toggles visibility on/off, broadcasts to all connected players instantly
- Players see only revealed elements
- State persists per-page

### Show to Players
Broadcast button: opens the Howard dialog on all player screens at the current tale/page.

### Roll Call
Ad-hoc skill check dialog — enter skill + DC, broadcasts to all players as a chat prompt.

### Theater Button
Projects the current page to the Theater canvas scene. First click activates the Theater scene (pulls everyone there). Subsequent clicks update the projected page.

---

## Theater Mode

A dedicated Foundry scene (auto-created, undeletable) with a custom PIXI canvas layer (`HowardTheaterLayer`).

- Renders the full comic page at scene scale using PIXI graphics
- Includes: background, page images, panels with image layers, text blocks, speech bubbles
- Supports per-element show/hide (synced with GM's presentation mode eye toggles)
- Cover page publishable to Theater (renders cover image fullscreen)
- Fonts: Bangers (speech), Comic Neue Bold (text/captions) loaded via Google Fonts before PIXI render

---

## Export / Import (.htale Format)

### Export
Produces a single `.htale` file (JSON with base64-encoded images).

Contents:
- `version`: format version (1)
- `system`: active game system ID
- `exportedAt`: ISO timestamp
- `tale`: full tale data (pages, panels, text blocks, speech bubbles, checks, enemies, GM notes, cover image, combatScene names)
- `images`: map of `{ imagePath: base64DataURL }` — all unique images used in the tale, encoded inline
- `scenes`: array of scene bundles — each includes scene dimensions, padding, background image, and Blood & Steel area data (areas, connections, losBlockers, losOpen, token positions)

### Import
Unpacks a `.htale` file into the current world:
1. Uploads all images to `worlds/{worldId}/howard-imported/{taleName}/` (skips existing files)
2. Remaps all image paths to new upload locations
3. Generates fresh tale and page IDs
4. Creates Foundry scenes at original dimensions
5. If system is `conan` and area data exists: creates area marker tokens with correct flags, rebuilds `conan.areaData` scene flag
6. Rewires `combatScene` references by scene name → new scene ID
7. Adds imported tale to Howard actor

---

## Broadcast System

All GM→Player communication uses invisible blind ChatMessages with module flags. No persistent socket connections. Messages self-delete after delivery.

| Flag | Purpose |
|---|---|
| `howardShow` | Open comic at tale/page on player screens |
| `howardReveal` | Legacy panel reveal/hide |
| `howardPresReveal` | Presentation mode element reveal/hide |
| `howardPresZoom` | Zoom to element on player screen |
| `howardPageVisibility` | Page hidden/shown — re-render player view |
| `howardTheaterPublish` | Update Theater canvas layer on player clients |
| `howardDismiss` | Close Howard on all player screens |

---

## Guards & Singletons

- **Howard actor**: singleton, auto-created on first `ready`, undeletable, hidden from Create Actor dialog
- **Theater scene**: singleton, auto-created on first `ready`, undeletable, flagged with `isTheater: true`
- Duplicate Howard actor creation blocked via `preCreateActor` hook

---

## Settings

| Key | Scope | Description |
|---|---|---|
| `enemyDataPath` | World | Path to enemy JSON for B&S drag feature. Auto-detected on load. |
| `theaterBackground` | World | Background image path applied behind the Theater scene comic page. |

---

## Data Storage

All tale data lives in the Howard actor's `system.tales` object (LevelDB via Foundry's actor document store). Structure:

```
system.tales.{taleId}
  .id
  .title
  .issueNumber
  .coverImage
  .currentPage
  .hiddenPages.{pageId}
  .revealedPanels.{pageId}.{elementId}
  .pages.{pageId}
    .id
    .pageNumber
    .background
    .images.{imageId}       — page-level image layers
    .panels.{panelId}       — freeform panel rectangles
      .layers.{layerId}     — per-panel image layers
    .textBlocks.{tbId}      — caption/text boxes
    .speechBubbles.{sbId}   — speech bubbles
    .skillMarkers.{markerId}
    .hiddenElements.{elId}
    .gmNotes
      .combatScene          — scene ID
      .enemies[]
      .checks[]
      .notes
      .title
```

---

## Typography

| Element | Font | Fallback |
|---|---|---|
| Speech bubbles | Bangers (Google Fonts) | Comic Sans MS |
| Text blocks / captions | Comic Neue Bold (Google Fonts) | Comic Sans MS |
| Both loaded via `@import` in CSS and `document.fonts.load()` before PIXI render |

---

## Print to PDF

The Howard sheet renders as a standard Foundry application window. Browser print (Ctrl+P) or Foundry's built-in print produces a PDF of the current comic page view. Physical handout capability — players can receive a printed comic recap of the session.

---

## Philosophy

> "The comic IS the session prep, the session recap, and the session itself."

Howard is not a journal tool, a notes app, or a map maker. It is a delivery mechanism for a story that is ready to play the moment it is opened. The GM's prep becomes a visual artifact that players experience, not a document they never see.

**Put panel. Put image. Size. Position. Repeat.**

---

*Last updated: 2026-03-13*
