/**
 * HowardTheaterLayer — Custom CanvasLayer for rendering comic pages via PIXI.
 * Only active on the Theater scene (flagged with isTheater).
 */

const MODULE_ID = 'howard-the-chronicler';
const ACTOR_TYPE = `${MODULE_ID}.howard`;

// Internal page dimensions (matches CSS comic page)
const PAGE_W = 520;
const PAGE_H = 780;

export default class HowardTheaterLayer extends CanvasLayer {

  /** PIXI container that holds the comic page display */
  _pageContainer = null;

  /** Published state — what's currently displayed on canvas */
  _publishedTaleId = null;
  _publishedPageIndex = null;

  /** Is this the Theater scene? */
  get isTheaterScene() {
    return !!canvas.scene?.getFlag(MODULE_ID, 'isTheater');
  }

  /** Get the Howard actor */
  get howard() {
    return game.actors.find(a => a.type === ACTOR_TYPE);
  }

  /** Calculate scale and offset to position the page on the scene.
   *  Border: 1 unit on left/right/bottom, 2 units on top.
   *  "unit" = the side margin size, top margin is 2x that. */
  get pageLayout() {
    const sceneW = canvas.scene?.width ?? 900;
    const sceneH = canvas.scene?.height ?? 1200;
    // Reserve: 1 unit left + 1 unit right = 2 units horizontal
    //          2 units top + 1 unit bottom = 3 units vertical
    // Solve for the largest page that fits with these margins.
    // Let m = side margin. Available width = sceneW - 2m, available height = sceneH - 3m.
    // We want the page to fill as much as possible, so find scale where margins are proportional.
    // Use iterative: start with scale from horizontal fit, derive margin, check vertical.
    const hScale = sceneW / (PAGE_W + 2 * (sceneW * 0.04));  // ~4% margin each side
    const margin = (sceneW - PAGE_W * hScale) / 2;
    const topMargin = margin * 2;
    const bottomMargin = margin;
    const availH = sceneH - topMargin - bottomMargin;
    const vScale = availH / PAGE_H;
    const scale = Math.min(hScale, vScale);
    const w = PAGE_W * scale;
    const h = PAGE_H * scale;
    // Center the page on the scene
    const x = (sceneW - w) / 2;
    const y = (sceneH - h) / 2;
    return { scale, x, y, w, h };
  }

  /** Called when the canvas layer is drawn */
  async _draw() {
    if (!this.isTheaterScene) return;
    console.log(`${MODULE_ID} | Theater layer drawn`);

    // Create the page container
    this._pageContainer = new PIXI.Container();
    this.addChild(this._pageContainer);

    // Show an empty page frame on initial draw
    this._drawEmptyPage();
  }

  /** Draw an empty page frame (waiting state) */
  _drawEmptyPage() {
    if (!this._pageContainer) return;
    this._pageContainer.removeChildren();

    const { scale, x, y } = this.pageLayout;

    const frame = new PIXI.Container();
    frame.x = x;
    frame.y = y;
    frame.scale.set(scale);

    // Page background
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1a2e);
    bg.lineStyle(3 / scale, 0x9a9a9e);  // light gray border
    bg.drawRect(0, 0, PAGE_W, PAGE_H);
    bg.endFill();
    frame.addChild(bg);

    // Waiting text
    const text = new PIXI.Text('Theater Ready', {
      fontFamily: 'Arial',
      fontSize: 20,
      fill: 0x4a5568,
      align: 'center'
    });
    text.anchor.set(0.5);
    text.x = PAGE_W / 2;
    text.y = PAGE_H / 2;
    frame.addChild(text);

    this._pageContainer.addChild(frame);
  }

  /**
   * Publish a page to the theater canvas.
   * Reads page data from the Howard actor and renders with PIXI.
   */
  async publishPage(taleId, pageIndex) {
    if (!this.isTheaterScene || !this._pageContainer) return;
    this._publishedTaleId = taleId;
    this._publishedPageIndex = pageIndex;
    console.log(`${MODULE_ID} | Publishing tale=${taleId} page=${pageIndex}`);

    // Ensure comic fonts are loaded before PIXI renders text
    await document.fonts.load('400 16px "Bangers"');
    await document.fonts.load('700 16px "Comic Neue"');

    const howard = this.howard;
    if (!howard) return;

    const tale = howard.system.tales?.[taleId];
    if (!tale) return;

    const pages = Object.values(tale.pages || {}).sort((a, b) => a.pageNumber - b.pageNumber);
    const isCover = pageIndex === -1;
    const page = isCover ? null : pages[pageIndex];
    if (!isCover && !page) return;

    // Clear existing content
    this._pageContainer.removeChildren();

    const { scale, x, y } = this.pageLayout;

    // Main page frame — positioned and scaled
    const frame = new PIXI.Container();
    frame.x = x;
    frame.y = y;
    frame.scale.set(scale);

    // Page border & background fill
    const border = new PIXI.Graphics();
    border.beginFill(0x1a1a2e);
    border.lineStyle(3 / scale, 0x9a9a9e);
    border.drawRect(0, 0, PAGE_W, PAGE_H);
    border.endFill();
    frame.addChild(border);

    // Clip mask — keep everything inside the page bounds
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, 0, PAGE_W, PAGE_H);
    mask.endFill();
    frame.addChild(mask);

    // Content container (masked)
    const content = new PIXI.Container();
    content.mask = mask;
    frame.addChild(content);

    // Cover page — just the cover image fullscreen
    if (isCover) {
      const coverSrc = tale.coverImage || 'modules/howard-the-chronicler/images/howard.png';
      await this._addSprite(content, coverSrc, {
        x: 0, y: 0, width: PAGE_W, height: PAGE_H, fit: 'cover'
      });
      this._pageContainer.addChild(frame);
      return;
    }

    // 1. Page background image
    if (page.background) {
      await this._addSprite(content, page.background, {
        x: 0, y: 0, width: PAGE_W, height: PAGE_H, fit: 'cover'
      });
    }

    // 2. Page-level image layers (from PAGE tool)
    const pageImages = Object.values(page.images || {})
      .sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1));
    for (const img of pageImages) {
      const posX = (img.posX ?? 0) / 100 * PAGE_W;
      const posY = (img.posY ?? 0) / 100 * PAGE_H;
      await this._addSprite(content, img.imagePath, {
        x: posX, y: posY, width: PAGE_W, height: PAGE_H, fit: 'cover'
      });
    }

    // 3. Panels — freeform rectangles with image layers, borders, and content
    const hiddenObj = page.hiddenElements || {};
    const panels = Object.values(page.panels || {}).map(p => ({
      ...p,
      x: p.x ?? 0,
      y: p.y ?? 0,
      width: p.width ?? 100,
      height: p.height ?? 100,
      zIndex: p.zIndex ?? 10,
      transparent: !!p.transparent
    })).sort((a, b) => a.zIndex - b.zIndex);

    for (const panel of panels) {
      const panelContainer = new PIXI.Container();
      panelContainer._howardId = panel.id;
      panelContainer._howardType = 'panel';

      // Position in page coordinates (% → px)
      const px = (panel.x / 100) * PAGE_W;
      const py = (panel.y / 100) * PAGE_H;
      const pw = (panel.width / 100) * PAGE_W;
      const ph = (panel.height / 100) * PAGE_H;
      panelContainer.x = px;
      panelContainer.y = py;

      // Panel clip mask
      const panelMask = new PIXI.Graphics();
      panelMask.beginFill(0xffffff);
      panelMask.drawRect(0, 0, pw, ph);
      panelMask.endFill();
      panelContainer.addChild(panelMask);

      // Clipped content
      const panelContent = new PIXI.Container();
      panelContent.mask = panelMask;
      panelContainer.addChild(panelContent);

      // Panel background + border (skip if transparent)
      if (!panel.transparent) {
        const panelBg = new PIXI.Graphics();
        panelBg.beginFill(0x1a1a2e);
        panelBg.lineStyle(2, 0x4a5568);
        panelBg.drawRoundedRect(0, 0, pw, ph, 3);
        panelBg.endFill();
        panelContent.addChild(panelBg);
      }

      // Panel image layers
      const layers = panel.layers ? Object.values(panel.layers).sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1)) : [];
      for (const layer of layers) {
        if (!layer.imagePath) continue;
        // Position: posX/posY are % within panel, zoom is % width
        const lx = (layer.posX ?? 50) / 100 * pw;
        const ly = (layer.posY ?? 50) / 100 * ph;
        const zoomW = (layer.zoom ?? 100) / 100 * pw;

        const sprite = await this._addSprite(panelContent, layer.imagePath, {
          x: 0, y: 0
        });
        if (sprite) {
          // Scale to zoom width, maintain aspect ratio
          const aspectScale = zoomW / sprite.texture.width;
          sprite.width = zoomW;
          sprite.height = sprite.texture.height * aspectScale;
          // Center on posX/posY (like CSS translate(-50%, -50%))
          sprite.x = lx - sprite.width / 2;
          sprite.y = ly - sprite.height / 2;
        }
      }

      // Panel text content (centered)
      if (panel.content?.trim()) {
        const panelFontSize = panel.fontSize ?? 14;
        const panelText = new PIXI.Text(panel.content, {
          fontFamily: '"Comic Neue", "Comic Sans MS", cursive',
          fontSize: panelFontSize,
          fontWeight: '700',
          fill: 0xffffff,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: pw - 16
        });
        panelText.anchor.set(0.5);
        panelText.x = pw / 2;
        panelText.y = ph / 2;
        panelContent.addChild(panelText);
      }

      // Hidden state — start hidden if in hiddenElements
      if (hiddenObj[panel.id]) {
        panelContainer.visible = false;
      }

      content.addChild(panelContainer);
    }

    // 4. Text blocks — narration boxes, captions, etc.
    const textBlocks = Object.values(page.textBlocks || {}).map(tb => ({
      ...tb,
      x: tb.x ?? tb.posX ?? 0,
      y: tb.y ?? tb.posY ?? 0,
      width: tb.width ?? tb.fixedWidth ?? 30,
      height: tb.height ?? 15,
      zIndex: tb.zIndex ?? tb.layerNum ?? 10,
      style: tb.style || 'caption',
      transparent: !!tb.transparent
    })).sort((a, b) => a.zIndex - b.zIndex);

    for (const tb of textBlocks) {
      const tbContainer = new PIXI.Container();
      tbContainer._howardId = tb.id;
      tbContainer._howardType = 'text';

      const tx = (tb.x / 100) * PAGE_W;
      const ty = (tb.y / 100) * PAGE_H;
      const tw = (tb.width / 100) * PAGE_W;
      const th = (tb.height / 100) * PAGE_H;
      tbContainer.x = tx;
      tbContainer.y = ty;

      // Style config based on text block style
      const styleConfig = this._getTextBlockStyle(tb.style, tb.transparent);

      // Background box
      if (styleConfig.bgColor !== null) {
        const bg = new PIXI.Graphics();
        if (styleConfig.bgAlpha < 1) {
          bg.beginFill(styleConfig.bgColor, styleConfig.bgAlpha);
        } else {
          bg.beginFill(styleConfig.bgColor);
        }
        if (styleConfig.borderColor) {
          bg.lineStyle(styleConfig.borderWidth, styleConfig.borderColor);
        }
        bg.drawRoundedRect(0, 0, tw, th, styleConfig.borderRadius);
        bg.endFill();
        tbContainer.addChild(bg);
      }

      // Text content
      if (tb.content?.trim()) {
        const tbFontSize = tb.fontSize ?? styleConfig.fontSize;
        const textObj = new PIXI.Text(tb.content, {
          fontFamily: '"Comic Neue", "Comic Sans MS", cursive',
          fontSize: tbFontSize,
          fill: styleConfig.textColor,
          fontWeight: '700',
          align: 'left',
          wordWrap: true,
          breakWords: true,        // match editor CSS word-wrap: break-word
          wordWrapWidth: tw - 20,  // match editor padding (10px each side)
          lineHeight: tbFontSize * 1.4
        });
        textObj.x = 10;
        textObj.y = 6;
        tbContainer.addChild(textObj);
      }

      // Hidden state
      if (hiddenObj[tb.id]) {
        tbContainer.visible = false;
      }

      content.addChild(tbContainer);
    }

    // 5. Speech bubbles — rounded rect + tail polygon + text
    const speechBubbles = Object.values(page.speechBubbles || {}).map(sb => ({
      ...sb,
      x: sb.x ?? sb.posX ?? 0,
      y: sb.y ?? sb.posY ?? 0,
      width: sb.width ?? 25,
      height: sb.height ?? 10,
      zIndex: sb.zIndex ?? 15
    })).sort((a, b) => a.zIndex - b.zIndex);

    for (const sb of speechBubbles) {
      // Container for the whole speech bubble (bubble + tail) — tagged for show/hide
      const sbContainer = new PIXI.Container();
      sbContainer._howardId = sb.id;
      sbContainer._howardType = 'speech';

      const sx = (sb.x / 100) * PAGE_W;
      const sy = (sb.y / 100) * PAGE_H;
      const sw = (sb.width / 100) * PAGE_W;
      const sh = (sb.height / 100) * PAGE_H;

      // Tail polygon (drawn in page coordinates, behind the bubble)
      const tailPoints = this._computeTailPoints(sb);
      if (tailPoints) {
        const tail = new PIXI.Graphics();
        tail.beginFill(0xffffff);
        tail.lineStyle(1.5, 0x333333);
        tail.drawPolygon(tailPoints);
        tail.endFill();
        sbContainer.addChild(tail);
      }

      // Bubble rectangle
      const bubble = new PIXI.Graphics();
      bubble.beginFill(0xffffff);
      bubble.lineStyle(2, 0x333333);
      bubble.drawRoundedRect(sx, sy, sw, sh, 14);
      bubble.endFill();
      sbContainer.addChild(bubble);

      // Speech text
      if (sb.content?.trim()) {
        const sbFontSize = sb.fontSize ?? 13;
        const sbText = new PIXI.Text(sb.content, {
          fontFamily: '"Bangers", "Comic Sans MS", cursive',
          fontSize: sbFontSize,
          fill: 0x000000,
          fontWeight: '400',
          letterSpacing: 0.5,
          align: 'left',
          wordWrap: true,
          breakWords: true,        // match editor CSS word-wrap: break-word
          wordWrapWidth: sw - 28,  // match bubble padding (14px each side)
          lineHeight: sbFontSize * 1.3
        });
        sbText.x = sx + 14;
        sbText.y = sy + 8;
        sbContainer.addChild(sbText);
      }

      // Hidden state
      if (hiddenObj[sb.id]) {
        sbContainer.visible = false;
      }

      content.addChild(sbContainer);
    }

    this._pageContainer.addChild(frame);
  }

  /**
   * Load a texture and add a sprite to a container.
   * @param {PIXI.Container} parent
   * @param {string} src - Image path
   * @param {object} opts - { x, y, width, height, fit }
   */
  async _addSprite(parent, src, opts = {}) {
    if (!src) return null;
    try {
      const texture = await loadTexture(src);
      if (!texture || texture === PIXI.Texture.EMPTY) return null;

      const sprite = new PIXI.Sprite(texture);

      if (opts.fit === 'cover' && opts.width && opts.height) {
        // Scale to cover the target area (like CSS object-fit: cover)
        const scaleX = opts.width / texture.width;
        const scaleY = opts.height / texture.height;
        const s = Math.max(scaleX, scaleY);
        sprite.width = texture.width * s;
        sprite.height = texture.height * s;
        // Center within the area
        sprite.x = (opts.x ?? 0) + (opts.width - sprite.width) / 2;
        sprite.y = (opts.y ?? 0) + (opts.height - sprite.height) / 2;
      } else {
        sprite.x = opts.x ?? 0;
        sprite.y = opts.y ?? 0;
        if (opts.width) sprite.width = opts.width;
        if (opts.height) sprite.height = opts.height;
      }

      parent.addChild(sprite);
      return sprite;
    } catch (err) {
      console.warn(`${MODULE_ID} | Failed to load texture: ${src}`, err);
      return null;
    }
  }

  /**
   * Compute tail polygon points for a speech bubble (in page pixel coordinates).
   * Ported from HowardSheet._computeTailGeometry — same algorithm, but returns
   * a flat array [b1x,b1y, tipX,tipY, b2x,b2y] in pixels instead of an SVG string.
   * @returns {number[]|null}
   */
  _computeTailPoints(sb) {
    const x = sb.x ?? sb.posX ?? 0;
    const y = sb.y ?? sb.posY ?? 0;
    const w = sb.width ?? 25;
    const h = sb.height ?? 10;
    const tx = sb.tailTipX;
    const ty = sb.tailTipY;
    if (tx == null || ty == null) return null;

    // All values are in % of page — compute in % then convert to px at the end
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null;

    const hw = w / 2;
    const hh = h / 2;

    // Find smallest positive t where ray hits rectangle edge
    let t = Infinity;
    if (dx > 0) t = Math.min(t, hw / dx);
    else if (dx < 0) t = Math.min(t, -hw / dx);
    if (dy > 0) t = Math.min(t, hh / dy);
    else if (dy < 0) t = Math.min(t, -hh / dy);

    const ix = cx + dx * t;
    const iy = cy + dy * t;
    // Pull the base inside the bubble (toward center) so its seam hides under the bubble fill
    const baseX = cx + (ix - cx) * 0.4;
    const baseY = cy + (iy - cy) * 0.4;

    // Perpendicular spread (thin, capped)
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len;
    const py = dx / len;
    const spread = Math.max(1.2, Math.min(2, Math.min(w, h) * 0.12));

    const b1x = baseX + px * spread;
    const b1y = baseY + py * spread;
    const b2x = baseX - px * spread;
    const b2y = baseY - py * spread;

    // Convert % → page pixels
    return [
      (b1x / 100) * PAGE_W, (b1y / 100) * PAGE_H,
      (tx / 100) * PAGE_W, (ty / 100) * PAGE_H,
      (b2x / 100) * PAGE_W, (b2y / 100) * PAGE_H
    ];
  }

  /**
   * Find a PIXI container by its howard element ID (panel, text, or speech).
   * Searches recursively through the page container.
   */
  _findElementById(elId) {
    if (!this._pageContainer) return null;
    const search = (container) => {
      for (const child of container.children) {
        if (child._howardId === elId) return child;
        if (child.children?.length) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this._pageContainer);
  }

  /**
   * Set visibility of an element on the theater canvas.
   * Called by show/hide broadcasts and GM toggle.
   */
  setElementVisibility(elId, visible) {
    const el = this._findElementById(elId);
    if (el) {
      el.visible = visible;
    }
  }

  /**
   * Get PIXI style config for a text block style type.
   * Matches the CSS classes: caption (default), speech, etc.
   */
  _getTextBlockStyle(style, transparent) {
    if (transparent) {
      return {
        bgColor: null, bgAlpha: 0, borderColor: null, borderWidth: 0, borderRadius: 0,
        textColor: 0xf0e6d2, fontSize: 13, fontWeight: '500', padding: 2
      };
    }
    switch (style) {
      case 'speech':
        return {
          bgColor: 0xffffff, bgAlpha: 1, borderColor: 0x333333, borderWidth: 2, borderRadius: 14,
          textColor: 0x1a1a1a, fontSize: 13, fontWeight: '400', padding: 8
        };
      case 'caption':
      default:
        return {
          bgColor: 0x000000, bgAlpha: 0.75, borderColor: 0xffffff, borderWidth: 1, borderRadius: 3,
          textColor: 0xf0e6d2, fontSize: 13, fontWeight: '500', padding: 6
        };
    }
  }

  /** Called when the canvas layer is torn down */
  async _tearDown() {
    this._pageContainer = null;
    this._publishedTaleId = null;
    this._publishedPageIndex = null;
    return super._tearDown();
  }
}
