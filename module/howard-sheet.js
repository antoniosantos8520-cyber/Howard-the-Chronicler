/**
 * Howard the Chronicler - Comic Book Rack & Tale System
 * Named after Robert E. Howard, creator of Conan
 */

const PAGE_TEMPLATES = {
  splash:       { label: "Splash",      icon: "fa-expand",       slots: 1, description: "1 giant panel" },
  cinematic:    { label: "Cinematic",    icon: "fa-film",         slots: 3, description: "3 horizontal strips" },
  standard:     { label: "Standard",     icon: "fa-th-large",     slots: 6, description: "Classic 6-panel grid" },
  dense:        { label: "Dense",        icon: "fa-th",           slots: 9, description: "9-panel grid" },
  split:        { label: "Split",        icon: "fa-columns",      slots: 2, description: "2 vertical halves" },
  lshape:       { label: "L-Shape",      icon: "fa-puzzle-piece", slots: 3, description: "1 large + 2 stacked" },
  "stat-block": { label: "Stat Block",   icon: "fa-scroll",       slots: 1, description: "Formatted stat layout" },
  handout:      { label: "Handout",      icon: "fa-file-alt",     slots: 1, description: "Full-page handout" }
};

const PANEL_TYPES = {
  narration:     { label: "Narration",    icon: "fa-italic" },
  dialogue:      { label: "Dialogue",     icon: "fa-comment" },
  "read-aloud":  { label: "Read Aloud",   icon: "fa-bullhorn" },
  "gm-note":     { label: "GM Note",      icon: "fa-eye-slash" },
  "skill-check": { label: "Skill Check",  icon: "fa-dice-d20" },
  image:         { label: "Image",        icon: "fa-image" }
};

export default class HowardSheet extends ActorSheet {

  // Instance state (not persisted — resets each sheet open)
  _currentIndex = 0;
  _isAnimating = false;
  _dragState = null;

  // Reader mode state
  _viewMode = 'rack';
  _activeTaleId = null;
  _readerPageIndex = 0;

  // Editor mode state (new 3-mode system)
  _editorMode = 'gm';       // 'gm' | 'forge' | 'play'
  _forgeTool = 'page';      // 'page' | 'panel' | 'text' | 'speech'
  _pageToolLocked = true;   // PAGE tool lock — starts locked, prevents accidental edits
  _panelToolLocked = true;  // PANEL tool lock — starts locked, prevents accidental edits
  _textToolLocked = true;   // TEXT tool lock — starts locked
  _textEditId = null;       // text block being edited inline, or null for list view
  _textDrawMode = false;    // draw rectangle to create text block
  _textDrawCleanup = null;
  _moveTextId = null;       // text block being moved/resized
  _moveTextCleanup = null;

  // GM Panel: Check placement & editing state
  _checkPlacePending = null;    // { skillName, dc, prompt } — waiting for page click
  _checkPlaceCleanup = null;
  _checkEditId = null;          // check being edited inline in GM panel
  _moveCheckId = null;          // check being moved on page
  _moveCheckCleanup = null;

  // SPEECH tool state
  _speechToolLocked = true;   // SPEECH tool lock — starts locked
  _speechEditId = null;       // speech bubble being edited inline, or null for list view
  _speechDrawMode = false;    // draw rectangle to create speech bubble
  _speechDrawCleanup = null;
  _moveSpeechId = null;       // speech bubble being moved/resized
  _moveSpeechCleanup = null;
  _speechAimId = null;        // speech bubble in tail-aim mode (click page to set tail tip)
  _speechAimCleanup = null;

  // Legacy edit sidebar state (being phased out)
  _editMode = false;
  _selectedPanelId = null;
  _unlockedPanelId = null;
  _lastDeleted = null; // { taleId, pageId, panelId, panelData }
  _deletedTale = null; // { id, data } — stashed tale for undo
  _activeTool = null; // null, 'image', etc.

  // Move mode state (layer repositioning)
  _moveMode = false;
  _moveLayerId = null;
  _moveCleanup = null;
  _pendingPositions = {}; // { layerId: { posX, posY } }

  // Text block move mode state
  _tbMoveMode = false;
  _tbMoveId = null;
  _tbMoveCleanup = null;
  _tbPendingPositions = {}; // { tbId: { posX, posY } }

  // Text block placement mode (draw-to-place)
  _tbPlacePending = null;   // { content, layerNum, style, tailDir }
  _tbPlaceCleanup = null;

  // Skill marker placement mode
  _smPlacePending = null;   // { prompt, skillName, dc }
  _smPlaceCleanup = null;

  // Skill marker move mode
  _smMoveMode = false;
  _smMoveId = null;
  _smMoveCleanup = null;
  _smPendingPositions = {};  // { markerId: { posX, posY } }

  // Page image move mode (PAGE tool — drag to reposition via left/top)
  _movePageImageId = null;
  _moveImgMousedown = null;

  // Panel draw mode (PANEL tool — draw rectangle to create panel)
  _panelDrawMode = false;
  _panelDrawCleanup = null;

  // Panel move mode (PANEL tool — drag to reposition/resize panel)
  _movePanelId = null;
  _movePanelCleanup = null;

  // Panel image inline editing (replaces dialog)
  _panelImageEditId = null;  // panelId being edited, or null for panel list view

  // Page scale state (fixed-size page + transform scale)
  _pageResizeObserver = null;

  // Presentation mode state
  _forgeSavedSize = null;        // { width, height } — saved Forge window size when entering Presentation

  // Show-to-players state
  _playerShowMode = false;       // true when sheet was opened via Show broadcast (player side)
  static _coverShownTales = {};  // { taleId: true } — per-session, tracks which tales had cover animation
  static _enemyLookup = null;    // Cached enemy name → { name, category, group, enemyId } lookup
  static _enemyCategories = null; // Cached raw categories object from enemies.json (for drag data)

  /** True when ANY move mode is active — blocks page turning */
  get _isMoving() {
    return this._moveMode || this._tbMoveMode || !!this._tbPlacePending || this._smMoveMode || !!this._smPlacePending || !!this._movePageImageId || this._panelDrawMode || !!this._movePanelId || this._textDrawMode || !!this._moveTextId || this._speechDrawMode || !!this._moveSpeechId || !!this._speechAimId || !!this._checkPlacePending || !!this._moveCheckId;
  }

  static get defaultOptions() {
    const isGM = game.user?.isGM ?? true;
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["howard-chronicler", "sheet", "howard"],
      template: "modules/howard-chronicler/templates/howard-sheet.hbs",
      width: isGM ? 1200 : 275,
      height: isGM ? 860 : 440,
      top: isGM ? undefined : 10,
      left: isGM ? undefined : 10,
      tabs: [],
      resizable: true,
      dragDrop: [{ dragSelector: ".howard-enemy-tag-linked", dropSelector: ".howard-enemy-tags" }]
    });
  }

  /** Track when a player manually moves or resizes the window */
  static _playerMoved = false;

  setPosition(pos = {}) {
    if (!game.user?.isGM && this.rendered && !this._settingDefaultPos) {
      HowardSheet._playerMoved = true;
    }
    return super.setPosition(pos);
  }

  get title() {
    if (this._viewMode === 'reader' && this._activeTaleId) {
      const tale = this.actor.system.tales?.[this._activeTaleId];
      if (tale) return `#${tale.issueNumber} ${tale.title}`;
    }
    return "Howard the Chronicler";
  }

  /** Add a back-to-rack button in the window title bar for players */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    // Remove text labels from close button (X only)
    const closeBtn = buttons.find(b => b.class === 'close');
    if (closeBtn) closeBtn.label = '';

    // Add back button when in reader mode
    if (this._viewMode === 'reader') {
      buttons.unshift({
        class: 'howard-header-back',
        icon: 'fas fa-arrow-left',
        label: '',
        onclick: () => {
          this._viewMode = 'rack';
          this._activeTaleId = null;
          this.render(true);
          this._updateWindowTitle();
        }
      });
    }
    return buttons;
  }

  getData() {
    const context = super.getData();
    const actorData = this.actor.toObject(false);

    context.system = actorData.system;
    context.flags = actorData.flags;
    context.isGM = game.user.isGM;

    // Build sorted tales list
    const talesObj = context.system.tales || {};
    context.tales = talesObj;
    context.talesList = Object.values(talesObj)
      .sort((a, b) => a.issueNumber - b.issueNumber);
    context.taleCount = context.talesList.length;
    context.activeTale = context.system.activeTale;

    // Template state flags
    context.isEmpty = context.taleCount === 0;
    context.showArrows = context.taleCount >= 3;
    context.canUndoTale = !!this._deletedTale;

    // View mode
    context.viewMode = this._viewMode;
    context.inReaderMode = this._viewMode === 'reader';
    context.editMode = this._editMode;
    context.showMode = this._showMode;           // 'show', 'hide', or false
    context.showModeShow = this._showMode === 'show';
    context.showModeHide = this._showMode === 'hide';

    // Editor mode (new 3-mode system)
    context.editorMode = this._editorMode;
    context.isGmMode = this._editorMode === 'gm';
    context.isForgeMode = this._editorMode === 'forge';
    context.isPlayMode = this._editorMode === 'play';
    context.forgeTool = this._forgeTool;
    context.pageToolLocked = this._pageToolLocked;
    context.panelToolLocked = this._panelToolLocked;
    context.panelImageEditId = this._panelImageEditId;
    context.textToolLocked = this._textToolLocked;
    context.textEditId = this._textEditId;
    context.speechToolLocked = this._speechToolLocked;
    context.speechEditId = this._speechEditId;
    context.checkEditId = this._checkEditId;

    // Reader mode context
    if (context.inReaderMode && this._activeTaleId) {
      const tale = talesObj[this._activeTaleId];
      if (tale) {
        context.readerTale = tale;
        context.readerTaleTitle = tale.title;
        context.readerIssueNumber = tale.issueNumber;

        // Build sorted pages list
        const pagesObj = tale.pages || {};
        context.readerPages = Object.values(pagesObj)
          .sort((a, b) => a.pageNumber - b.pageNumber);
        context.readerPageCount = context.readerPages.length;

        // Clamp reader page index (-1 = cover page)
        if (context.readerPages.length > 0) {
          this._readerPageIndex = Math.max(-1,
            Math.min(this._readerPageIndex, context.readerPages.length - 1));
        }

        // Non-GM: if current page is hidden, bump to nearest visible page (or cover)
        if (!context.isGM && this._readerPageIndex >= 0) {
          const _hp = tale.hiddenPages || {};
          const curPage = context.readerPages[this._readerPageIndex];
          if (curPage && _hp[curPage.id]) {
            // Search backward for a visible page, fall back to cover
            let found = -1;
            for (let i = this._readerPageIndex - 1; i >= 0; i--) {
              if (!_hp[context.readerPages[i].id]) { found = i; break; }
            }
            this._readerPageIndex = found;
          }
        }

        // Cover page detection
        context.isCoverPage = this._readerPageIndex === -1;
        if (context.isCoverPage) {
          context.coverImage = tale.coverImage || 'modules/howard-chronicler/images/howard.png';
          context.currentPage = null;
          context.currentPageIndex = -1;
        } else {
          context.currentPage = context.readerPages[this._readerPageIndex] || null;
          context.currentPageIndex = this._readerPageIndex;
        }

        if (context.currentPage) {
          // Page background
          context.pageBackground = context.currentPage.background || null;

          // Page-level image layers (PAGE tool)
          const imagesObj = context.currentPage.images || {};
          context.currentPageImages = Object.values(imagesObj)
            .sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1))
            .map(img => ({
              ...img,
              posX: img.posX ?? 0,
              posY: img.posY ?? 0,
              layerNum: img.layerNum ?? 1
            }));
          context.hasPageImages = context.currentPageImages.length > 0;

          // Build freeform panels array (new system — panels have x/y/width/height)
          const panelsObj = context.currentPage.panels || {};
          context.currentPanels = Object.values(panelsObj).map(p => {
            // Panel's own image layers (default posX/posY to 50% = centered for object-position)
            const panelLayers = p.layers ? Object.values(p.layers).sort((a, b) => a.layerNum - b.layerNum).map(l => ({
              ...l,
              posX: l.posX ?? 50,
              posY: l.posY ?? 50,
              zoom: l.zoom ?? 100,
              layerNum: l.layerNum ?? 1
            })) : [];
            return {
              ...p,
              x: p.x ?? 0,
              y: p.y ?? 0,
              width: p.width ?? 100,
              height: p.height ?? 100,
              zIndex: p.zIndex ?? 10,
              transparent: !!p.transparent,
              hasContent: !!(p.content?.trim()),
              layers: panelLayers,
              hasLayers: panelLayers.length > 0
            };
          }).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

          // Hidden elements (Forge hide/show targeting)
          const hiddenObj = context.currentPage.hiddenElements || {};

          // Panel reveal state (Show to Players)
          const revealedObj = tale.revealedPanels?.[context.currentPage.id] || {};
          context.currentPanels.forEach(p => {
            p.isRevealed = !!revealedObj[p.id];
            p.isHidden = !!hiddenObj[p.id];
            // Non-GM: hide elements that are in hiddenElements (Presentation system)
            if (!context.isGM && hiddenObj[p.id]) {
              p.isHiddenForPresentation = true;
            }
          });

          // Panel image inline editing — build image list for the selected panel
          if (this._panelImageEditId && panelsObj[this._panelImageEditId]) {
            const editPanel = panelsObj[this._panelImageEditId];
            const editLayers = editPanel.layers ? Object.values(editPanel.layers).sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1)) : [];
            context.currentPanelImages = editLayers.map(l => ({
              ...l,
              posX: l.posX ?? 50,
              posY: l.posY ?? 50,
              zoom: l.zoom ?? 100,
              layerNum: l.layerNum ?? 1
            }));
          } else if (this._panelImageEditId) {
            // Panel no longer exists — exit edit mode
            this._panelImageEditId = null;
          }

          // Undo available?
          context.hasUndo = !!(this._lastDeleted &&
            this._lastDeleted.taleId === this._activeTaleId &&
            this._lastDeleted.pageId === context.currentPage.id);

          // Build text blocks array
          const textBlocksObj = context.currentPage.textBlocks || {};
          context.currentTextBlocks = Object.values(textBlocksObj)
            .map(tb => ({
              ...tb,
              x: tb.x ?? tb.posX ?? 0,
              y: tb.y ?? tb.posY ?? 0,
              width: tb.width ?? tb.fixedWidth ?? 30,
              height: tb.height ?? 15,
              zIndex: tb.zIndex ?? tb.layerNum ?? 10,
              content: tb.content || '',
              style: tb.style || 'caption',
              transparent: !!tb.transparent,
              hasContent: !!(tb.content?.trim()),
              preview: (tb.content || '').substring(0, 40) || '(empty)'
            }))
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          context.hasTextBlocks = context.currentTextBlocks.length > 0;

          // Text edit content for inline editor
          if (this._textEditId && textBlocksObj[this._textEditId]) {
            context.textEditContent = textBlocksObj[this._textEditId].content || '';
          } else if (this._textEditId) {
            this._textEditId = null;
          }

          // Text block reveal + hidden state
          context.currentTextBlocks.forEach(tb => {
            tb.isRevealed = !!revealedObj[tb.id];
            tb.isHidden = !!hiddenObj[tb.id];
            if (!context.isGM && hiddenObj[tb.id]) {
              tb.isHiddenForPresentation = true;
            }
          });

          // Build skill markers array (GM only)
          if (context.isGM) {
            const markersObj = context.currentPage.skillMarkers || {};
            context.currentSkillMarkers = Object.values(markersObj);
            context.hasSkillMarkers = context.currentSkillMarkers.length > 0;
          } else {
            context.currentSkillMarkers = [];
            context.hasSkillMarkers = false;
          }

          // GM notes indicator (GM only)
          if (context.isGM) {
            const gn = context.currentPage.gmNotes;
            context.hasGmNotes = !!(gn && (gn.title || gn.notes || gn.enemies?.length || gn.npcs?.length || gn.sceneId));
          }

          // Image tool active?
          context.imageMode = this._activeTool === 'image';
        }

        // Navigation state (-1 = cover, 0+ = content pages)
        // For players, check if there's a visible (non-hidden) page in each direction
        const _hiddenPagesNav = tale.hiddenPages || {};
        if (!context.isGM) {
          const hasVisibleBefore = context.readerPages.some((p, i) => i < this._readerPageIndex && !_hiddenPagesNav[p.id]);
          context.canGoBack = this._readerPageIndex > -1 && (this._readerPageIndex === 0 || hasVisibleBefore);
          const hasVisibleAfter = context.readerPages.some((p, i) => i > this._readerPageIndex && !_hiddenPagesNav[p.id]);
          context.canGoForward = hasVisibleAfter;
        } else {
          context.canGoBack = this._readerPageIndex > -1;
          context.canGoForward = this._readerPageIndex < context.readerPages.length - 1;
        }
        context.canAddPage = context.readerPages.length < 32;
        if (context.isCoverPage) {
          context.pageDisplay = `Cover / ${context.readerPages.length} pages`;
        } else {
          context.pageDisplay = context.readerPages.length > 0
            ? `${this._getPageLabel()} / ${context.readerPages.length} pages`
            : '0 / 0';
        }

        // Hidden pages (tale-level, keyed by page ID)
        const hiddenPages = tale.hiddenPages || {};

        // Page strip items (for left sidebar page list)
        context.pageStripItems = context.readerPages.map((p, i) => ({
          index: i,
          display: i + 1,
          active: i === this._readerPageIndex,
          isPageHidden: !!hiddenPages[p.id],
          pageId: p.id
        }));

        // For players: filter out hidden pages from strip
        if (!context.isGM) {
          context.pageStripItems = context.pageStripItems.filter(item => !item.isPageHidden);
        }

        // Speech bubbles on this page (all users — needed for Presentation mode)
        if (context.currentPage) {
          const hiddenObjSb = context.currentPage.hiddenElements || {};
          const sbObj = context.currentPage.speechBubbles || {};
          context.currentSpeechBubbles = Object.values(sbObj)
            .map(sb => ({
              ...sb,
              x: sb.x ?? sb.posX ?? 0,
              y: sb.y ?? sb.posY ?? 0,
              width: sb.width ?? 25,
              height: sb.height ?? 10,
              zIndex: sb.zIndex ?? 15,
              content: sb.content || '',
              hasContent: !!(sb.content?.trim()),
              preview: (sb.content || '').substring(0, 40) || '(empty)',
              tailPoints: this._computeTailGeometry(sb),
              isHidden: !!hiddenObjSb[sb.id],
              isHiddenForPresentation: !context.isGM && !!hiddenObjSb[sb.id]
            }))
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          context.hasSpeechBubbles = context.currentSpeechBubbles.length > 0;
        } else {
          context.currentSpeechBubbles = [];
        }

        // GM Mode data (per-page)
        if (context.currentPage && context.isGM) {
          const hiddenObj = context.currentPage.hiddenElements || {};
          // Enemies staged on this page
          context.currentEnemies = context.currentPage.enemies || [];
          // Skill checks on this page (object keyed by ID, or legacy array)
          const rawChecks = context.currentPage.checks || {};
          const checksObj = Array.isArray(rawChecks) ? {} : rawChecks;
          context.currentChecks = Object.values(checksObj)
            .map(c => ({
              ...c,
              posX: c.posX ?? 50,
              posY: c.posY ?? 50,
              fired: c.fired ?? false,
              preview: `${c.skillName || 'Skill'} DC ${c.dc || '?'}`
            }))
            .sort((a, b) => (a.skillName || '').localeCompare(b.skillName || ''));
          context.hasChecks = context.currentChecks.length > 0;

          // Check edit content for inline editor
          if (this._checkEditId && checksObj[this._checkEditId]) {
            context.checkEditData = checksObj[this._checkEditId];
          } else if (this._checkEditId) {
            this._checkEditId = null;
          }
          // GM Notes for this page
          context.currentGmNotes = context.currentPage.gmNotes || { title: '', notes: '' };

          // Fight scene picker — list all scenes
          const currentCombatScene = context.currentPage.gmNotes?.combatScene || '';
          context.sceneList = game.scenes.contents
            .map(s => ({ id: s.id, name: s.name, selected: s.id === currentCombatScene }));

          // Speech edit content for inline editor
          const sbObjGm = context.currentPage.speechBubbles || {};
          if (this._speechEditId && sbObjGm[this._speechEditId]) {
            context.speechEditContent = sbObjGm[this._speechEditId].content || '';
          } else if (this._speechEditId) {
            this._speechEditId = null;
          }
        } else if (!context.isGM) {
          context.currentEnemies = [];
          context.currentChecks = [];
          context.currentGmNotes = { title: '', notes: '' };
        }
      } else {
        // Tale was deleted while we were viewing it
        this._viewMode = 'rack';
        this._activeTaleId = null;
        context.inReaderMode = false;
      }
    }

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Add player-view class to the window wrapper so CSS can target the header
    const appEl = this.element?.[0]?.closest('.app');
    if (appEl) {
      if (!game.user.isGM) appEl.classList.add('howard-player');
      else appEl.classList.remove('howard-player');
    }

    // Player default position: top-left corner, unless they've moved/resized it
    if (!game.user.isGM && !HowardSheet._playerMoved) {
      this._settingDefaultPos = true;
      this.setPosition({ left: 10, top: 10, width: 275, height: 440 });
      this._settingDefaultPos = false;
    }

    // Foundry disables all <button> elements in non-editable forms (Observer permission).
    // Howard is an interactive viewer, not a data form — re-enable buttons for players.
    if (!this.isEditable) {
      html.find('button').prop('disabled', false);
    }

    // Floating back button for player reader view
    if (!game.user.isGM && this._viewMode === 'reader') {
      html.find('.howard-player-back-float').remove();
      const btn = $('<button class="howard-player-back-float" title="Back to tales"><i class="fas fa-arrow-left"></i></button>');
      btn.click(() => {
        this._viewMode = 'rack';
        this._activeTaleId = null;
        this.render(true);
        this._updateWindowTitle();
      });
      html.find('.howard-container').prepend(btn);

      // Player click-to-zoom: click any panel/text/speech to zoom, click overlay to dismiss
      html.find('.howard-panel-freeform, .howard-text-freeform, .howard-speech-bubble').on('click.playerZoom', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const el = $(ev.currentTarget);
        const elId = String(el.data('panelId') || el.data('tbId') || el.data('sbId') || '');
        if (!elId) return;
        HowardSheet._showZoomOverlay(this, elId);
      });
    }

    if (this._viewMode === 'reader') {
      this._activateReaderListeners(html);
      return;
    }

    // === RACK MODE LISTENERS ===

    const talesObj = this.actor.system.tales || {};
    const talesList = Object.values(talesObj)
      .sort((a, b) => a.issueNumber - b.issueNumber);
    const count = talesList.length;

    // Clamp currentIndex
    if (count > 0) {
      this._currentIndex = Math.max(0, Math.min(this._currentIndex, count - 1));
    }

    // Empty state button
    html.find('.howard-add-first-tale').click(() => this._onAddTale());

    // Header buttons
    html.find('.howard-add-tale-btn').click(() => this._onAddTale());
    html.find('.howard-delete-tale-btn').click(() => this._onDeleteTale());
    html.find('.howard-undo-tale-btn').click(() => this._onUndoDeleteTale());
    html.find('.howard-export-btn').click(() => this._onExportPDF());

    // Footer cover art picker — changes cover of currently centered tale
    html.find('.howard-change-cover-btn').click(() => {
      if (count === 0) return;
      const idx = count < 3 ? 0 : this._currentIndex;
      const tale = talesList[idx];
      if (!tale) return;
      new FilePicker({
        type: "image",
        current: tale.coverImage || "modules/howard-chronicler/images/Tales/",
        callback: (path) => {
          this.actor.update({ [`system.tales.${tale.id}.coverImage`]: path });
        }
      }).render(true);
    });

    // Footer Forge button — opens currently centered tale (GM only)
    html.find('.howard-edit-tale-btn').click(() => {
      if (this._rackDragged) return;
      if (count === 0) return;
      const idx = count < 3 ? 0 : this._currentIndex;
      const tale = talesList[idx];
      if (tale) this._onOpenIssue(tale.id);
    });

    // View button — opens currently centered tale in reader mode
    html.find('.howard-view-btn').click(() => {
      if (this._rackDragged) return;
      if (count === 0) return;
      const idx = count < 3 ? 0 : this._currentIndex;
      const tale = talesList[idx];
      if (tale) this._onOpenIssue(tale.id);
    });

    // Nothing more to do if empty
    if (count === 0) return;

    const track = html.find('.howard-rack-track');
    if (!track.length) return;

    // Render the rack
    this._renderRack(track, talesList);

    // Arrow buttons
    html.find('.howard-rack-arrow-left').click(() => this._navigate(-1, html, talesList));
    html.find('.howard-rack-arrow-right').click(() => this._navigate(1, html, talesList));

    // Keyboard navigation
    const rackEl = html.find('.howard-rack')[0];
    if (rackEl) {
      rackEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); this._navigate(-1, html, talesList); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this._navigate(1, html, talesList); }
      });
    }

    // Drag/swipe
    this._attachDragHandlers(html, talesList);
  }

  /* ------------------------------------------ */
  /*  Reader Mode Listeners                     */
  /* ------------------------------------------ */

  _activateReaderListeners(html) {
    // Page scaling — observe the scaler wrapper and fit the fixed-size page inside it
    this._setupPageScaling(html);

    // Top bar: Back button — in Presentation: go to Forge; otherwise: go to rack
    html.find('.howard-back-to-rack').click(() => {
      if (this._editorMode === 'play') {
        this._editorMode = 'gm';
        // Restore forge size if saved
        if (this._forgeSavedSize) {
          this.setPosition(this._forgeSavedSize);
          this._forgeSavedSize = null;
        }
        this.render(false);
      } else {
        this._onBackToRack();
      }
    });

    // Top bar: Forge Play button — enter Presentation mode
    html.find('.howard-play-btn').click(() => {
      this._editorMode = 'play';
      // Save forge size and shrink to presentation size (no right panel)
      this._forgeSavedSize = { width: this.position.width, height: this.position.height };
      this.setPosition({ width: 460, height: 720 });
      this.render(false);
    });

    // === PRESENTATION MODE HANDLERS ===

    // Presentation: Play — broadcast to players (open their comic)
    html.find('.howard-pres-play-btn').click(() => this._openForPlayers());

    // Presentation: GM Notes — open read-only dialog with page GM data
    html.find('.howard-pres-notes-btn').click(() => this._openPresGmNotes());

    // Presentation: Roll Call — ad-hoc skill check dialog
    html.find('.howard-pres-rollcall-btn').click(() => this._onRollCall());

    // Presentation: Per-element eye icon — toggle visibility + broadcast
    html.find('.howard-pres-eye').click((ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const container = $(ev.currentTarget).closest('.howard-panel-freeform, .howard-text-freeform, .howard-speech-bubble');
      const elId = String(container.data('panelId') || container.data('tbId') || container.data('sbId') || '');
      if (!elId) return;
      this._presToggleElement(elId);
    });

    // Presentation: Per-element magnifying glass — zoom + broadcast
    html.find('.howard-pres-zoom').click((ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const container = $(ev.currentTarget).closest('.howard-panel-freeform, .howard-text-freeform, .howard-speech-bubble');
      this._presZoomElement(container);
    });

    // Page navigation arrows
    html.find('.howard-page-prev').click(() => this._navigatePage(-1));
    html.find('.howard-page-next').click(() => this._navigatePage(1));

    // Page strip: left-click to navigate
    html.find('.howard-page-strip-item').click((ev) => {
      const idx = parseInt(ev.currentTarget.dataset.pageIndex);
      if (isNaN(idx) || idx === this._readerPageIndex) return;
      this._readerPageIndex = idx;
      this.render(false);
    });

    // Page strip: right-click to toggle page hidden (GM only, all editor modes)
    if (game.user.isGM && (this._editorMode === 'gm' || this._editorMode === 'forge' || this._editorMode === 'play')) {
      html.find('.howard-page-strip-item').on('contextmenu', (ev) => {
        ev.preventDefault();
        const pageId = ev.currentTarget.dataset.pageId;
        if (!pageId) return;
        const isHidden = $(ev.currentTarget).hasClass('howard-page-hidden');
        this._togglePageHidden(pageId, !isHidden);
      });
    }

    // Page strip: add/delete page
    html.find('.howard-add-page-btn').click(() => this._onAddPage());
    html.find('.howard-delete-page-btn').click(() => this._onDeletePage());

    // Keyboard navigation for page flipping
    const editorLayout = html.find('.howard-editor-layout')[0];
    if (editorLayout) {
      editorLayout.setAttribute('tabindex', '0');
      editorLayout.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); this._navigatePage(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this._navigatePage(1); }
      });
      editorLayout.focus();
    }

    // GM-only: mode toggle and right panel
    if (game.user.isGM) {
      // Mode toggle (GM / Forge)
      html.find('.howard-mode-btn').click((ev) => {
        const mode = ev.currentTarget.dataset.mode;
        if (mode && mode !== this._editorMode) {
          this._editorMode = mode;
          this.render(false);
        }
      });

      // Forge tool buttons
      html.find('.howard-forge-tool-btn').click((ev) => {
        const tool = ev.currentTarget.dataset.forgeTool;
        if (tool && tool !== this._forgeTool) {
          this._forgeTool = tool;
          this.render(false);
        }
      });

      // PAGE tool: Lock toggle
      html.find('.howard-page-lock-card').click(() => {
        this._pageToolLocked = !this._pageToolLocked;
        if (this._pageToolLocked) this._deactivatePageImageMove();
        this.render(false);
      });

      // PAGE tool: Add image
      html.find('.howard-add-page-image').click(() => {
        if (this._pageToolLocked) return;
        this._onAddPageImage();
      });

      // PAGE tool: Delete image
      html.find('.howard-image-delete').click((ev) => {
        ev.stopPropagation();
        if (this._pageToolLocked) return;
        const imageId = ev.currentTarget.closest('.howard-forge-card').dataset.imageId;
        this._onDeletePageImage(imageId);
      });

      // PAGE tool: Layer up/down
      html.find('.howard-layer-up').click((ev) => {
        ev.stopPropagation();
        if (this._pageToolLocked) return;
        const imageId = ev.currentTarget.closest('.howard-forge-card').dataset.imageId;
        this._onPageImageLayerChange(imageId, 1);
      });
      html.find('.howard-layer-down').click((ev) => {
        ev.stopPropagation();
        if (this._pageToolLocked) return;
        const imageId = ev.currentTarget.closest('.howard-forge-card').dataset.imageId;
        this._onPageImageLayerChange(imageId, -1);
      });

      // PAGE tool: Click card thumbnail to change image
      html.find('.howard-forge-card-thumb').click((ev) => {
        if (this._pageToolLocked) return;
        const imageId = ev.currentTarget.closest('.howard-forge-card').dataset.imageId;
        this._onChangePageImage(imageId);
      });

      // PAGE tool: Move image position (bullseye toggle)
      html.find('.howard-image-move').click((ev) => {
        ev.stopPropagation();
        if (this._pageToolLocked) return;
        const imageId = ev.currentTarget.closest('.howard-forge-card').dataset.imageId;
        if (this._movePageImageId === imageId) {
          this._deactivatePageImageMove();
        } else {
          this._activatePageImageMove(imageId);
        }
      });

      // Re-activate page image move mode if it survived a re-render
      if (this._movePageImageId && this._forgeTool === 'page') {
        const savedId = this._movePageImageId;
        this._movePageImageId = null;
        this._moveImgMousedown = null;
        this._activatePageImageMove(savedId);
      }

      // --- PANEL tool handlers ---

      // Panel lock toggle
      html.find('.howard-panel-lock-card').click(() => {
        this._panelToolLocked = !this._panelToolLocked;
        if (this._panelToolLocked) {
          this._deactivatePanelMove();
          this._exitPanelDrawMode(html);
        }
        this.render(false);
      });

      // Draw Panel button → enter draw mode
      html.find('.howard-draw-panel').click(() => {
        if (this._panelToolLocked) return;
        this._enterPanelDrawMode(html);
      });

      // Panel card: z-index up/down
      html.find('.howard-panel-layer-up').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        this._onPanelZIndexChange(panelId, 1);
      });
      html.find('.howard-panel-layer-down').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        this._onPanelZIndexChange(panelId, -1);
      });

      // Panel card: delete
      html.find('.howard-panel-delete').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        this._onDeletePanel(panelId);
      });

      // Panel card: duplicate (same size/position, no images)
      html.find('.howard-panel-duplicate').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        this._onDuplicatePanel(panelId);
      });

      // Panel card: toggle transparent (no border/background)
      html.find('.howard-panel-transparent-toggle').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        const basePath = this._getPageBasePath();
        const currentPage = this._getCurrentPage();
        const panel = currentPage?.panels?.[panelId];
        if (!panel) return;
        this.actor.update({ [`${basePath}.panels.${panelId}.transparent`]: !panel.transparent });
      });

      // Panel card: open inline image editor
      html.find('.howard-panel-images').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        this._panelImageEditId = panelId;
        this.render(false);
      });

      // Panel image editor: back button
      html.find('.howard-panel-images-back').click(() => {
        this._deactivatePanelImageMove();
        this._panelImageEditId = null;
        this.render(false);
      });

      // Panel image editor: add image
      html.find('.howard-pimg-inline-add').click(() => {
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        new FilePicker({
          type: "image",
          current: "",
          callback: (path) => {
            const pg = this._getCurrentPage();
            const pnl = pg?.panels?.[panelId];
            const lyrs = pnl?.layers || {};
            const maxLayer = Object.values(lyrs).reduce((max, l) => Math.max(max, l.layerNum || 0), 0);
            const layerId = `layer-${Date.now()}`;
            const basePath = this._getPageBasePath();
            this.actor.update({
              [`${basePath}.panels.${panelId}.layers.${layerId}`]: {
                id: layerId,
                imagePath: path,
                layerNum: maxLayer + 1,
                posX: 50,
                posY: 50
              }
            });
          }
        }).render(true);
      });

      // Panel image editor: delete image
      html.find('.howard-pimg-inline-delete').click((ev) => {
        ev.stopPropagation();
        const layerId = ev.currentTarget.closest('.howard-forge-card').dataset.layerId;
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        const basePath = this._getPageBasePath();
        this.actor.update({ [`${basePath}.panels.${panelId}.layers.-=${layerId}`]: null });
      });

      // Panel image editor: layer up/down
      html.find('.howard-pimg-inline-up').click((ev) => {
        ev.stopPropagation();
        const layerId = ev.currentTarget.closest('.howard-forge-card').dataset.layerId;
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        const basePath = this._getPageBasePath();
        this._panelImageLayerChange(`${basePath}.panels.${panelId}`, layerId, 1);
      });
      html.find('.howard-pimg-inline-down').click((ev) => {
        ev.stopPropagation();
        const layerId = ev.currentTarget.closest('.howard-forge-card').dataset.layerId;
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        const basePath = this._getPageBasePath();
        this._panelImageLayerChange(`${basePath}.panels.${panelId}`, layerId, -1);
      });

      // Panel image editor: move image (bullseye) — toggle on/off
      html.find('.howard-pimg-inline-move').click((ev) => {
        ev.stopPropagation();
        const layerId = ev.currentTarget.closest('.howard-forge-card').dataset.layerId;
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        if (this._panelImageMoveState?.layerId === layerId) {
          this._deactivatePanelImageMove();
          this.render(false);
        } else {
          this._activatePanelImageMoveInline(panelId, layerId, html);
        }
      });

      // Panel image editor: click thumbnail to change image
      html.find('.howard-forge-panel-images-inline .howard-forge-card-thumb').click((ev) => {
        const layerId = ev.currentTarget.closest('.howard-forge-card').dataset.layerId;
        const panelId = this._panelImageEditId;
        if (!panelId) return;
        const pg = this._getCurrentPage();
        const lyr = pg?.panels?.[panelId]?.layers?.[layerId];
        const basePath = this._getPageBasePath();
        new FilePicker({
          type: "image",
          current: lyr?.imagePath || "",
          callback: (path) => {
            this.actor.update({ [`${basePath}.panels.${panelId}.layers.${layerId}.imagePath`]: path });
          }
        }).render(true);
      });

      // Panel card: move/resize bullseye
      html.find('.howard-panel-move').click((ev) => {
        ev.stopPropagation();
        if (this._panelToolLocked) return;
        const panelId = ev.currentTarget.closest('.howard-forge-panel-card').dataset.panelId;
        if (this._movePanelId === panelId) {
          this._deactivatePanelMove();
        } else {
          this._activatePanelMove(panelId, html);
        }
      });

      // Re-activate panel move if it survived re-render
      if (this._movePanelId && this._forgeTool === 'panel') {
        const savedId = this._movePanelId;
        this._movePanelId = null;
        this._activatePanelMove(savedId, html);
      }

      // Panel card hover → highlight on comic display
      html.find('.howard-forge-panel-card').on('mouseenter', (ev) => {
        const panelId = ev.currentTarget.dataset.panelId;
        this.element.find(`.howard-panel-freeform[data-panel-id="${panelId}"]`).addClass('howard-panel-highlight');
      }).on('mouseleave', (ev) => {
        const panelId = ev.currentTarget.dataset.panelId;
        this.element.find(`.howard-panel-freeform[data-panel-id="${panelId}"]`).removeClass('howard-panel-highlight');
      });

      // --- TEXT tool handlers ---

      // Text lock toggle
      html.find('.howard-text-lock-card').click(() => {
        this._textToolLocked = !this._textToolLocked;
        if (this._textToolLocked) {
          this._deactivateTextMove();
          this._exitTextDrawMode(html);
        }
        this.render(false);
      });

      // Draw Text Box button
      html.find('.howard-draw-text').click(() => {
        if (this._textToolLocked) return;
        this._enterTextDrawMode(html);
      });

      // Text card: z-index up/down
      html.find('.howard-text-layer-up').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        this._onTextZIndexChange(tbId, 1);
      });
      html.find('.howard-text-layer-down').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        this._onTextZIndexChange(tbId, -1);
      });

      // Text card: toggle transparent (no border/background)
      html.find('.howard-text-transparent-toggle').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        const basePath = this._getPageBasePath();
        const currentPage = this._getCurrentPage();
        const tb = currentPage?.textBlocks?.[tbId];
        if (!tb) return;
        this.actor.update({ [`${basePath}.textBlocks.${tbId}.transparent`]: !tb.transparent });
      });

      // Text card: delete
      html.find('.howard-text-delete').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        this._onDeleteTextBlock(tbId);
      });

      // Text card: edit → switch to inline editor
      html.find('.howard-text-edit').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        this._textEditId = tbId;
        this.render(false);
      });

      // Text card: move/resize bullseye — toggle
      html.find('.howard-text-move').click((ev) => {
        ev.stopPropagation();
        if (this._textToolLocked) return;
        const tbId = ev.currentTarget.closest('.howard-forge-text-card').dataset.tbId;
        if (this._moveTextId === tbId) {
          this._deactivateTextMove();
          this.render(false);
        } else {
          this._activateTextMove(tbId, html);
        }
      });

      // Re-activate text move if it survived re-render
      if (this._moveTextId && this._forgeTool === 'text') {
        const savedId = this._moveTextId;
        this._moveTextId = null;
        this._activateTextMove(savedId, html);
      }

      // Text card hover → highlight on comic display
      html.find('.howard-forge-text-card').on('mouseenter', (ev) => {
        const tbId = ev.currentTarget.dataset.tbId;
        this.element.find(`.howard-text-freeform[data-tb-id="${tbId}"]`).addClass('howard-text-highlight');
      }).on('mouseleave', (ev) => {
        const tbId = ev.currentTarget.dataset.tbId;
        this.element.find(`.howard-text-freeform[data-tb-id="${tbId}"]`).removeClass('howard-text-highlight');
      });

      // Text editor: back button
      html.find('.howard-text-edit-back').click(() => {
        this._textEditId = null;
        this.render(false);
      });

      // Text editor: save button
      html.find('.howard-text-edit-save').click(() => {
        const tbId = this._textEditId;
        if (!tbId) return;
        const content = html.find('.howard-text-edit-area').val();
        const basePath = this._getPageBasePath();
        this.actor.update({
          [`${basePath}.textBlocks.${tbId}.content`]: content
        });
        this._textEditId = null;
      });

      // ====== SPEECH TOOL HANDLERS ======

      // Speech lock toggle
      html.find('.howard-speech-lock-card').click(() => {
        this._speechToolLocked = !this._speechToolLocked;
        if (this._speechToolLocked) {
          this._deactivateSpeechMove();
          this._deactivateSpeechAim();
          this._exitSpeechDrawMode(html);
        }
        this.render(false);
      });

      // Draw Speech Bubble button
      html.find('.howard-draw-speech').click(() => {
        if (this._speechToolLocked) return;
        this._enterSpeechDrawMode(html);
      });

      // Speech card: z-index up/down
      html.find('.howard-speech-layer-up').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        this._onSpeechZIndexChange(sbId, 1);
      });
      html.find('.howard-speech-layer-down').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        this._onSpeechZIndexChange(sbId, -1);
      });

      // Speech card: delete
      html.find('.howard-speech-delete').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        this._onDeleteSpeechBubble(sbId);
      });

      // Speech card: edit → switch to inline editor
      html.find('.howard-speech-edit').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        this._speechEditId = sbId;
        this.render(false);
      });

      // Speech card: move/resize bullseye — toggle
      html.find('.howard-speech-move').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        if (this._moveSpeechId === sbId) {
          this._deactivateSpeechMove();
          this.render(false);
        } else {
          this._activateSpeechMove(sbId, html);
        }
      });

      // Speech card: aim tail — toggle
      html.find('.howard-speech-aim').click((ev) => {
        ev.stopPropagation();
        if (this._speechToolLocked) return;
        const sbId = ev.currentTarget.closest('.howard-forge-speech-card').dataset.sbId;
        if (this._speechAimId === sbId) {
          this._deactivateSpeechAim();
          this.render(false);
        } else {
          this._activateSpeechAim(sbId, html);
        }
      });

      // Re-activate speech move if it survived re-render
      if (this._moveSpeechId && this._forgeTool === 'speech') {
        const savedId = this._moveSpeechId;
        this._moveSpeechId = null;
        this._activateSpeechMove(savedId, html);
      }

      // Speech card hover → highlight on comic display
      html.find('.howard-forge-speech-card').on('mouseenter', (ev) => {
        const sbId = ev.currentTarget.dataset.sbId;
        this.element.find(`.howard-speech-freeform[data-sb-id="${sbId}"]`).addClass('howard-speech-highlight');
      }).on('mouseleave', (ev) => {
        const sbId = ev.currentTarget.dataset.sbId;
        this.element.find(`.howard-speech-freeform[data-sb-id="${sbId}"]`).removeClass('howard-speech-highlight');
      });

      // Speech editor: back button
      html.find('.howard-speech-edit-back').click(() => {
        this._speechEditId = null;
        this.render(false);
      });

      // Speech editor: save button
      html.find('.howard-speech-edit-save').click(() => {
        const sbId = this._speechEditId;
        if (!sbId) return;
        const content = html.find('.howard-speech-edit-area').val();
        const basePath = this._getPageBasePath();
        this.actor.update({
          [`${basePath}.speechBubbles.${sbId}.content`]: content
        });
        this._speechEditId = null;
      });

      // ====== GM PANEL: ENEMIES ======

      // Ensure enemy data is loaded for Conan enemy lookup (optional)
      if (!HowardSheet._enemyCategories) HowardSheet._loadEnemyLookup();

      // Add actor via + button or Enter key — try: sidebar actor → Conan enemy → plain text
      const addEnemyFromInput = async () => {
        const input = html.find('.howard-enemy-input');
        const name = input.val()?.trim();
        if (!name) return;
        input.val('');

        // 1. Try matching a world actor by name
        const worldActor = game.actors.find(a => a.name.toLowerCase() === name.toLowerCase());
        if (worldActor) {
          this._addEnemyToPage({
            name: worldActor.name, img: worldActor.img || null,
            uuid: worldActor.uuid, category: null, group: null, enemyId: null
          });
          return;
        }

        // 2. Try Conan enemy lookup (if available)
        const lookup = await HowardSheet._loadEnemyLookup();
        const match = lookup[name.toLowerCase()];
        if (match) {
          this._addEnemyToPage({
            name: match.name, img: null,
            uuid: null, category: match.category, group: match.group, enemyId: match.enemyId
          });
          return;
        }

        // 3. Plain text tag (not linked, not draggable)
        this._addEnemyToPage({
          name, img: null, uuid: null, category: null, group: null, enemyId: null
        });
      };
      html.find('.howard-enemy-add-btn').click(addEnemyFromInput);
      html.find('.howard-enemy-input').on('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); addEnemyFromInput(); }
      });

      // Remove enemy tag via × button
      html.find('.howard-enemy-tag-x').click((ev) => {
        ev.stopPropagation();
        const index = parseInt(ev.currentTarget.closest('.howard-enemy-tag').dataset.index);
        if (!isNaN(index)) this._removeEnemyFromPage(index);
      });

      // Enemy tag name click → open actor sheet (UUID) or Albert (Conan category)
      html.find('.howard-enemy-tag-link').click(async (ev) => {
        ev.stopPropagation();
        const tag = ev.target.closest('.howard-enemy-tag');
        const uuid = tag?.dataset.uuid;
        const category = tag?.dataset.category;
        const group = tag?.dataset.group;
        if (uuid) {
          const actor = await fromUuid(uuid);
          if (actor) actor.sheet.render(true);
        } else if (category && group) {
          HowardSheet._openAlbertToEnemy(category, group);
        }
      });

      // Drop from Albert + drag to canvas both handled by Foundry DragDrop (_onDragStart / _onDrop)
      // Visual highlight for drop zone
      const dropZone = html.find('.howard-enemy-tags')[0];
      if (dropZone) {
        dropZone.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          dropZone.classList.add('howard-enemy-drop-highlight');
        });
        dropZone.addEventListener('dragleave', () => {
          dropZone.classList.remove('howard-enemy-drop-highlight');
        });
        dropZone.addEventListener('drop', () => {
          dropZone.classList.remove('howard-enemy-drop-highlight');
        });
      }

      // ====== GM PANEL: CHECKS (positioned markers on page) ======

      // Add check via + button → Dialog → placement crosshair
      html.find('.howard-check-add-btn').click(() => {
        new Dialog({
          title: 'Add Skill Check',
          content: `
            <form class="howard-check-form" style="display:flex;flex-direction:column;gap:8px;padding:4px;">
              <div style="display:flex;gap:6px;align-items:center;">
                <label style="width:60px;font-size:12px;">Skill</label>
                <input type="text" name="skillName" placeholder="e.g. Athletics" style="flex:1;" />
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <label style="width:60px;font-size:12px;">DC</label>
                <input type="number" name="dc" value="10" min="1" max="30" style="width:60px;" />
              </div>
              <div style="display:flex;gap:6px;align-items:flex-start;">
                <label style="width:60px;font-size:12px;padding-top:4px;">Success</label>
                <textarea name="prompt" rows="3" placeholder="Revealed on success..." style="flex:1;resize:vertical;"></textarea>
              </div>
            </form>`,
          buttons: {
            add: {
              label: '<i class="fas fa-crosshairs"></i> Place on Page',
              callback: (dlg) => {
                const skillName = dlg.find('[name="skillName"]').val()?.trim();
                const dc = parseInt(dlg.find('[name="dc"]').val()) || 10;
                const prompt = dlg.find('[name="prompt"]').val()?.trim() || '';
                if (!skillName) return;
                this._checkPlacePending = { skillName, dc, prompt };
                setTimeout(() => this._startCheckPlacement(), 100);
              }
            },
            cancel: { label: 'Cancel' }
          },
          default: 'add'
        }).render(true);
      });

      // Check panel icon click → open inline edit
      html.find('.howard-check-icon').click((ev) => {
        const checkId = ev.currentTarget.dataset.checkId;
        if (!checkId) return;
        this._checkEditId = checkId;
        this.render(false);
      });

      // Check page marker click → fire the check roll
      html.find('.howard-check-marker').click((ev) => {
        ev.stopPropagation();
        const checkId = ev.currentTarget.dataset.checkId;
        if (!checkId) return;
        if (this._moveCheckId) return; // don't fire while moving
        this._fireCheck(checkId);
      });

      // Check edit: back button
      html.find('.howard-check-edit-back').click(() => {
        this._deactivateCheckMove();
        this._checkEditId = null;
        this.render(false);
      });

      // Check edit: save button
      html.find('.howard-check-edit-save').click(() => {
        const checkId = this._checkEditId;
        if (!checkId) return;
        const skillName = html.find('.howard-check-edit-skill').val()?.trim();
        const dc = parseInt(html.find('.howard-check-edit-dc').val()) || 10;
        const prompt = html.find('.howard-check-edit-prompt').val()?.trim() || '';
        if (!skillName) return;
        const basePath = this._getPageBasePath();
        if (basePath) {
          this.actor.update({
            [`${basePath}.checks.${checkId}.skillName`]: skillName,
            [`${basePath}.checks.${checkId}.dc`]: dc,
            [`${basePath}.checks.${checkId}.prompt`]: prompt
          });
        }
        this._checkEditId = null;
      });

      // Check edit: delete button
      html.find('.howard-check-edit-delete').click(() => {
        const checkId = this._checkEditId;
        if (!checkId) return;
        this._deactivateCheckMove();
        this._removeCheckFromPage(checkId);
        this._checkEditId = null;
      });

      // Check edit: move toggle
      html.find('.howard-check-edit-move').click(() => {
        const checkId = this._checkEditId;
        if (!checkId) return;
        if (this._moveCheckId === checkId) {
          this._deactivateCheckMove();
        } else {
          this._activateCheckMove(checkId, html);
        }
      });

      // Re-activate check move if it survived re-render
      if (this._moveCheckId && this._checkEditId) {
        const savedId = this._moveCheckId;
        this._moveCheckId = null;
        this._activateCheckMove(savedId, html);
      }

      // Check icon hover → highlight marker on page
      html.find('.howard-check-icon').on('mouseenter', (ev) => {
        const checkId = ev.currentTarget.dataset.checkId;
        this.element.find(`.howard-check-marker[data-check-id="${checkId}"]`).addClass('howard-check-highlight');
      }).on('mouseleave', (ev) => {
        const checkId = ev.currentTarget.dataset.checkId;
        this.element.find(`.howard-check-marker[data-check-id="${checkId}"]`).removeClass('howard-check-highlight');
      });

      // GM Notes: auto-save title on blur
      html.find('.howard-notes-title').on('change', (ev) => {
        this._saveGmNotesField('title', ev.currentTarget.value);
      });

      // GM Notes: auto-save text on blur
      html.find('.howard-notes-text').on('change', (ev) => {
        this._saveGmNotesField('notes', ev.currentTarget.value);
      });

      // Fight scene picker
      html.find('.howard-fight-scene-select').on('change', (ev) => {
        this._saveGmNotesField('combatScene', ev.currentTarget.value);
      });
    }
  }

  /** Save a single GM notes field without re-render */
  _saveGmNotesField(field, value) {
    if (!this._activeTaleId) return;
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;
    const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}.gmNotes`;
    this.actor.update({
      [`${basePath}.${field}`]: value
    }, { render: false });
  }

  /** Foundry DragDrop override — drag tags to canvas.
   *  UUID tags emit standard Foundry Actor drag data (works with any system).
   *  Conan enemy tags emit ConanEnemy drag data (works with Conan GM Tools). */
  _onDragStart(event) {
    const tag = event.currentTarget;
    if (!tag.classList.contains('howard-enemy-tag-linked')) return;

    // Standard actor (has UUID) — emit Foundry Actor drag data
    const uuid = tag.dataset.uuid;
    if (uuid) {
      const dragData = { type: 'Actor', uuid };
      event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      return;
    }

    // Conan enemy (has category/group/enemyId) — emit ConanEnemy drag data
    const category = tag.dataset.category;
    const group = tag.dataset.group;
    const enemyId = tag.dataset.enemyId;
    if (!category || !group || !enemyId || category === 'null') return;

    const cats = HowardSheet._enemyCategories;
    if (!cats) {
      console.warn('Howard | _enemyCategories not loaded');
      return;
    }
    const enemyBase = cats[category]?.groups?.[group]?.enemies?.find(e => e.id === enemyId);
    if (!enemyBase) {
      console.warn('Howard | Enemy not found in categories:', category, group, enemyId);
      return;
    }

    const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const tokenImg = enemyBase.tokenImg || 'icons/svg/mystery-man.svg';
    const portraitImg = enemyBase.portraitImg || tokenImg;
    const physDef = enemyBase.defenses?.physical ? randomInRange(enemyBase.defenses.physical.min, enemyBase.defenses.physical.max) : null;
    const sorcDef = enemyBase.defenses?.sorcery ? randomInRange(enemyBase.defenses.sorcery.min, enemyBase.defenses.sorcery.max) : null;
    const ar = enemyBase.ar ? randomInRange(enemyBase.ar.min, enemyBase.ar.max) : null;
    const groupBackgrounds = ((() => { try { return game.settings.get('conan', 'enemyGroupBackgrounds'); } catch(e) { return {}; } })()) || {};
    const groupBackground = groupBackgrounds[`${category}.${group}`] || '';

    const dragData = {
      type: 'ConanEnemy',
      enemy: {
        ...enemyBase,
        category, group,
        tokenImg, portraitImg, groupBackground,
        physicalDefense: physDef,
        sorceryDefense: sorcDef,
        armorRating: ar
      }
    };

    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }

  /** Foundry DragDrop override — accept drops into enemy tags area.
   *  Handles: Actor (sidebar/compendium), ConanEnemy (Albert), Item (future). */
  async _onDrop(event) {
    const tagsEl = event.currentTarget;
    if (!tagsEl.classList.contains('howard-enemy-tags')) return;

    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));

      // Standard Foundry Actor drop (sidebar or compendium)
      if (data.type === 'Actor') {
        const actor = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
        if (!actor) return;
        this._addEnemyToPage({
          name: actor.name,
          img: actor.img || 'icons/svg/mystery-man.svg',
          uuid: data.uuid || actor.uuid,
          category: null, group: null, enemyId: null
        });
        return;
      }

      // Conan enemy drop (from Albert/GM Tools)
      if (data.type === 'ConanEnemy' && data.enemy) {
        const e = data.enemy;
        this._addEnemyToPage({
          name: e.name,
          img: e.portraitImg || e.tokenImg || null,
          uuid: null,
          category: e.category || null,
          group: e.group || null,
          enemyId: e.id || null
        });
        return;
      }
    } catch (_) { /* ignore non-JSON drops */ }
  }

  /** Add an enemy to the current page's enemies array */
  async _addEnemyToPage(enemyObj) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    const page = this._getCurrentPage();
    const enemies = [...(page?.enemies || []), enemyObj];
    this.actor.update({ [`${basePath}.enemies`]: enemies });
  }

  /** Remove an enemy from the current page by array index */
  _removeEnemyFromPage(index) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    const page = this._getCurrentPage();
    const enemies = [...(page?.enemies || [])];
    enemies.splice(index, 1);
    this.actor.update({ [`${basePath}.enemies`]: enemies });
  }

  /** Add a positioned check to the current page (object keyed by ID) */
  _addCheckToPage(checkObj) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({ [`${basePath}.checks.${checkObj.id}`]: checkObj });
  }

  /** Remove a check from the current page by ID */
  _removeCheckFromPage(checkId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({ [`${basePath}.checks.-=${checkId}`]: null });
  }

  /** Start check placement mode — crosshair cursor, click to place icon */
  _startCheckPlacement() {
    if (!this._checkPlacePending) return;
    const pageEl = this.element.find('.howard-page')[0];
    if (!pageEl) { this._checkPlacePending = null; return; }

    pageEl.classList.add('howard-check-placing');

    const onClick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const pageRect = pageEl.getBoundingClientRect();
      const posX = Math.max(0, Math.min(100, ((ev.clientX - pageRect.left) / pageRect.width) * 100));
      const posY = Math.max(0, Math.min(100, ((ev.clientY - pageRect.top) / pageRect.height) * 100));

      pageEl.classList.remove('howard-check-placing');
      cleanup();

      const pending = this._checkPlacePending;
      this._checkPlacePending = null;
      if (pending) {
        const checkId = `chk-${Date.now()}`;
        this._addCheckToPage({
          id: checkId,
          skillName: pending.skillName,
          dc: pending.dc,
          prompt: pending.prompt,
          posX: Math.round(posX * 10) / 10,
          posY: Math.round(posY * 10) / 10,
          fired: false
        });
      }
    };

    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        cleanup();
        this._checkPlacePending = null;
        pageEl.classList.remove('howard-check-placing');
      }
    };

    const cleanup = () => {
      pageEl.removeEventListener('mousedown', onClick, { capture: true });
      document.removeEventListener('keydown', onKeyDown);
      this._checkPlaceCleanup = null;
    };

    pageEl.addEventListener('mousedown', onClick, { capture: true });
    document.addEventListener('keydown', onKeyDown);
    this._checkPlaceCleanup = cleanup;
  }

  /** Cancel check placement if active */
  _cancelCheckPlacement() {
    if (this._checkPlaceCleanup) {
      this._checkPlaceCleanup();
      this._checkPlaceCleanup = null;
    }
    this._checkPlacePending = null;
    this.element?.find('.howard-page')?.removeClass('howard-check-placing');
  }

  /** Activate move mode for a check marker on the page */
  _activateCheckMove(checkId, html) {
    if (this._moveCheckId) this._deactivateCheckMove();
    this._moveCheckId = checkId;

    const markerEl = this.element.find(`.howard-check-marker[data-check-id="${checkId}"]`)[0];
    if (!markerEl) return;
    markerEl.classList.add('howard-check-moving');

    const pageEl = markerEl.closest('.howard-page');
    if (!pageEl) return;

    html?.find(`.howard-check-edit-move`)?.addClass('active');

    const onMousedown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const pageRect = pageEl.getBoundingClientRect();
      const startPosX = parseFloat(markerEl.style.left) || 50;
      const startPosY = parseFloat(markerEl.style.top) || 50;
      const startMX = ev.clientX;
      const startMY = ev.clientY;
      markerEl.style.cursor = 'grabbing';

      const onMove = (e) => {
        const dx = ((e.clientX - startMX) / pageRect.width) * 100;
        const dy = ((e.clientY - startMY) / pageRect.height) * 100;
        markerEl.style.left = `${(startPosX + dx).toFixed(1)}%`;
        markerEl.style.top = `${(startPosY + dy).toFixed(1)}%`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        markerEl.style.cursor = '';

        const basePath = this._getPageBasePath();
        if (basePath) {
          this.actor.update({
            [`${basePath}.checks.${checkId}.posX`]: Math.round(parseFloat(markerEl.style.left) * 10) / 10,
            [`${basePath}.checks.${checkId}.posY`]: Math.round(parseFloat(markerEl.style.top) * 10) / 10
          }, { render: false });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    markerEl.addEventListener('mousedown', onMousedown, { capture: true });
    this._moveCheckCleanup = () => {
      markerEl.removeEventListener('mousedown', onMousedown, { capture: true });
      markerEl.classList.remove('howard-check-moving');
      html?.find(`.howard-check-edit-move`)?.removeClass('active');
      this._moveCheckId = null;
    };
  }

  _deactivateCheckMove() {
    if (this._moveCheckCleanup) {
      this._moveCheckCleanup();
      this._moveCheckCleanup = null;
    }
    this._moveCheckId = null;
  }

  /** Fire a check — Howard chat message with Roll button + GM dialog */
  async _fireCheck(checkId) {
    if (this._moveCheckId) return;

    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage?.checks?.[checkId]) return;

    const check = currentPage.checks[checkId];

    // Howard chat message (announcement only — players roll using their own system)
    const howardImg = 'modules/howard-chronicler/images/howard.png';
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const content = `
      <div class="conan-roll spell-chat-card howard-check-card">
        <div class="spell-chat-header">
          <div class="spell-chat-portrait-wrap">
            <img src="${howardImg}" class="spell-chat-portrait"/>
            <div class="howard-check-badge"><i class="fas fa-dice-d20"></i></div>
          </div>
          <div class="spell-chat-title">
            <strong>Howard the Chronicler</strong> calls for a <strong>${esc(check.skillName)}</strong> check
          </div>
        </div>
        <div class="spell-chat-body">
          <div class="spell-chat-meta">
            <strong>${esc(check.skillName)}</strong> &nbsp;|&nbsp; <span style="color: #FFD700;">Difficulty ${check.dc}</span>
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      content,
      speaker: { alias: "Howard the Chronicler" }
    });

    // Open GM check control dialog (top-right quadrant)
    if (game.user.isGM) {
      this._openCheckDialog(check);
    }
  }

  /** Open the GM-only check control dialog */
  _openCheckDialog(check) {
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    // Store active check state
    this._activeCheck = { check, dc: check.dc };

    // Build player rows from active non-GM users with characters
    const players = game.users.filter(u => !u.isGM && u.active && u.character);
    let playerRowsHtml = '';
    if (players.length) {
      for (const u of players) {
        const actor = u.character;
        const tokenImg = actor.prototypeToken?.texture?.src || actor.img || 'icons/svg/mystery-man.svg';
        playerRowsHtml += `
          <div class="gm-check-player-row" data-actor-id="${actor.id}">
            <img src="${tokenImg}" class="gm-check-player-token" />
            <span class="gm-check-player-name">${esc(actor.name)}</span>
            <div class="gm-check-toggle" title="Click to toggle pass/fail"><i class="fas fa-check"></i></div>
          </div>`;
      }
    } else {
      playerRowsHtml = '<div class="gm-check-empty">No active players with characters.</div>';
    }

    const dialogContent = `
      <div class="gm-check-dialog-body">
        <div class="gm-check-summary">
          <i class="fas fa-dice-d20 gm-check-icon"></i>
          <div class="gm-check-info">
            <div class="gm-check-stat">${esc(check.skillName)}</div>
            <div class="gm-check-dc">Difficulty ${check.dc}</div>
          </div>
        </div>
        ${check.prompt ? `<div class="gm-check-section-label">Hidden Success Text</div><div class="gm-check-success-preview">${esc(check.prompt)}</div>` : ''}
        <div class="gm-check-section-label">Players</div>
        <div class="gm-check-player-list">${playerRowsHtml}</div>
        <button type="button" class="gm-check-reveal-btn"><i class="fas fa-eye"></i> Reveal</button>
      </div>`;

    const dlg = new Dialog({
      title: `${check.skillName} Check — Difficulty ${check.dc}`,
      content: dialogContent,
      buttons: {},
      render: (html) => {
        // Toggle pass/fail on click
        html.find('.gm-check-toggle').click((ev) => {
          $(ev.currentTarget).toggleClass('checked');
        });
        // Reveal button
        html.find('.gm-check-reveal-btn').click(() => {
          this._revealCheckResult(check, dlg);
        });
      },
      close: () => { this._activeCheck = null; this._activeCheckDialog = null; }
    }, {
      width: 300,
      classes: ['bpm-dialog-window', 'gm-check-dialog'],
      top: 80,
      left: window.innerWidth - 340
    });
    this._activeCheckDialog = dlg;
    dlg.render(true);
  }

  /** Post the outcome chat message and close the dialog */
  async _revealCheckResult(check, dlg) {
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const howardImg = 'modules/howard-chronicler/images/howard.png';

    // Read who passed/failed from dialog DOM
    const passed = [];
    const failed = [];
    dlg.element.find('.gm-check-player-row').each((i, el) => {
      const name = $(el).find('.gm-check-player-name').text();
      const isChecked = $(el).find('.gm-check-toggle').hasClass('checked');
      if (isChecked) passed.push(name);
      else failed.push(name);
    });

    const anyPassed = passed.length > 0;

    // Default fail messages by stat
    const defaultFail = {
      might: [
        "Brute strength alone is not enough. The obstacle holds firm.",
        "Muscles strain and sinew screams — but nothing yields.",
        "Despite your best effort, raw power fails you this time.",
        "The task demands more than even a strong arm can deliver."
      ],
      edge: [
        "Quick hands and sharp eyes are not enough — the moment slips away.",
        "Nimble as you are, this challenge proves too slippery.",
        "Speed and cunning fail where patience might have served.",
        "Your reflexes betray you at the worst possible moment."
      ],
      grit: [
        "Endurance has its limits, and you have found yours.",
        "You grit your teeth and push on — but your body refuses.",
        "Willpower alone cannot carry you through this trial.",
        "The pain is too great. Even iron resolve has a breaking point."
      ],
      wits: [
        "The answer dances at the edge of your mind — but escapes you.",
        "Keen senses are not enough. The truth remains hidden.",
        "You study the problem but the pieces refuse to fit.",
        "Cleverness fails where deeper insight was needed."
      ]
    };

    // Build name tags
    let nameTags = '';
    for (const n of passed) {
      nameTags += `<span class="howard-outcome-tag pass"><i class="fas fa-check"></i> ${esc(n)}</span>`;
    }
    for (const n of failed) {
      nameTags += `<span class="howard-outcome-tag fail"><i class="fas fa-times"></i> ${esc(n)}</span>`;
    }

    // Success or fail text
    let outcomeHtml = '';
    if (anyPassed) {
      const successText = check.prompt || 'The challenge is overcome.';
      outcomeHtml = `
        <div class="howard-outcome-label success">Success</div>
        <div class="howard-outcome-text success">${esc(successText)}</div>`;
    } else {
      const attrKey = (check.skillName || 'might').toLowerCase();
      const failPool = defaultFail[attrKey] || defaultFail.might;
      const failText = check.failText || failPool[Math.floor(Math.random() * failPool.length)];
      outcomeHtml = `
        <div class="howard-outcome-label fail">Failed</div>
        <div class="howard-outcome-text fail">${esc(failText)}</div>`;
    }

    const content = `
      <div class="conan-roll spell-chat-card howard-check-card howard-outcome-card">
        <div class="howard-outcome-header">
          <img src="${howardImg}" class="howard-outcome-portrait" />
          <div class="howard-outcome-title"><strong>${esc(check.skillName)}</strong> Check — ${anyPassed ? 'Resolved' : 'Failed'}</div>
        </div>
        <div class="howard-outcome-body">
          <div class="howard-outcome-names">${nameTags}</div>
          ${outcomeHtml}
        </div>
      </div>`;

    await ChatMessage.create({
      content,
      speaker: { alias: "Howard the Chronicler" }
    });

    dlg.close();
  }

  /* ------------------------------------------ */
  /*  PAGE Tool Methods                         */
  /* ------------------------------------------ */

  /** Helper: get the current page object */
  _getCurrentPage() {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return null;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    return pages[this._readerPageIndex] || null;
  }

  /** Helper: get the base update path for the current page */
  _getPageBasePath() {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return null;
    return `system.tales.${this._activeTaleId}.pages.${currentPage.id}`;
  }

  /** Open FilePicker to add a new page-level image layer */
  _onAddPageImage() {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;

    new FilePicker({
      type: "image",
      current: "",
      callback: (path) => {
        const imageId = `img-${Date.now()}`;
        const images = currentPage.images || {};
        const maxLayer = Object.values(images).reduce((max, img) => Math.max(max, img.layerNum || 0), 0);
        const basePath = this._getPageBasePath();
        this.actor.update({
          [`${basePath}.images.${imageId}`]: {
            id: imageId,
            imagePath: path,
            layerNum: maxLayer + 1,
            posX: 0,
            posY: 0
          }
        });
      }
    }).render(true);
  }

  /** Delete a page-level image layer */
  _onDeletePageImage(imageId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({
      [`${basePath}.images.-=${imageId}`]: null
    });
  }

  /** Change the image file for an existing page image layer */
  _onChangePageImage(imageId) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;
    const img = currentPage.images?.[imageId];
    if (!img) return;

    new FilePicker({
      type: "image",
      current: img.imagePath || "",
      callback: (path) => {
        const basePath = this._getPageBasePath();
        this.actor.update({
          [`${basePath}.images.${imageId}.imagePath`]: path
        });
      }
    }).render(true);
  }

  /** Shift a page image's layerNum up or down by delta */
  _onPageImageLayerChange(imageId, delta) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;
    const img = currentPage.images?.[imageId];
    if (!img) return;

    const newLayer = Math.max(1, (img.layerNum || 1) + delta);
    const basePath = this._getPageBasePath();
    this.actor.update({
      [`${basePath}.images.${imageId}.layerNum`]: newLayer
    });
  }

  /* ------------------------------------------ */
  /*  Page Image Move Mode                      */
  /* ------------------------------------------ */

  /** Activate drag-to-reposition for a page image */
  _activatePageImageMove(imageId) {
    // Clean up any previous
    if (this._movePageImageId) {
      this._deactivatePageImageMove();
    }
    this._movePageImageId = imageId;

    // Highlight the bullseye button on the card
    this.element.find(`.howard-forge-card[data-image-id="${imageId}"] .howard-image-move`).addClass('active');

    // Find the image on the comic display
    const imgEl = this.element.find(`.howard-page-layer-image[data-image-id="${imageId}"]`)[0];
    if (!imgEl) return;

    // Enable interaction on the image
    imgEl.style.pointerEvents = 'auto';
    imgEl.style.cursor = 'grab';
    imgEl.classList.add('howard-image-moveable');

    // Attach mousedown for drag start
    this._moveImgMousedown = (ev) => this._onPageImageDragStart(ev, imageId);
    imgEl.addEventListener('mousedown', this._moveImgMousedown);
  }

  /** Deactivate page image move mode */
  _deactivatePageImageMove() {
    if (!this._movePageImageId) return;

    const imgEl = this.element.find(`.howard-page-layer-image[data-image-id="${this._movePageImageId}"]`)[0];
    if (imgEl) {
      imgEl.style.pointerEvents = '';
      imgEl.style.cursor = '';
      imgEl.classList.remove('howard-image-moveable');
      if (this._moveImgMousedown) {
        imgEl.removeEventListener('mousedown', this._moveImgMousedown);
      }
    }

    // Remove active class from bullseye button
    this.element.find('.howard-image-move.active').removeClass('active');
    this._movePageImageId = null;
    this._moveImgMousedown = null;
  }

  /** Handle mousedown on a page image in move mode — start drag (left/top, like old _setupLayerDrag) */
  _onPageImageDragStart(ev, imageId) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const imgEl = ev.target;

    // Get page container dimensions (accounts for CSS transform scaling)
    const page = imgEl.closest('.howard-page');
    const pageRect = page.getBoundingClientRect();

    // Parse current left/top percentages
    const startPosX = parseFloat(imgEl.style.left) || 0;
    const startPosY = parseFloat(imgEl.style.top) || 0;
    const startMouseX = ev.clientX;
    const startMouseY = ev.clientY;

    imgEl.style.cursor = 'grabbing';

    const onMove = (e) => {
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      // Convert pixel delta to percentage of page dimensions
      const newX = Math.max(-50, Math.min(150, startPosX + (dx / pageRect.width) * 100));
      const newY = Math.max(-50, Math.min(150, startPosY + (dy / pageRect.height) * 100));
      imgEl.style.left = `${newX.toFixed(1)}%`;
      imgEl.style.top = `${newY.toFixed(1)}%`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      imgEl.style.cursor = '';

      // Read final position and save
      const posX = Math.round((parseFloat(imgEl.style.left) || 0) * 10) / 10;
      const posY = Math.round((parseFloat(imgEl.style.top) || 0) * 10) / 10;

      const basePath = this._getPageBasePath();
      if (basePath) {
        this.actor.update({
          [`${basePath}.images.${imageId}.posX`]: posX,
          [`${basePath}.images.${imageId}.posY`]: posY
        }, { render: false });
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ------------------------------------------ */
  /*  PANEL Tool Methods                        */
  /* ------------------------------------------ */

  /** Enter draw mode — next mousedown+drag on comic display creates a panel */
  _enterPanelDrawMode(html) {
    if (this._panelDrawMode) return;
    this._panelDrawMode = true;

    const comicDisplay = html.find('.howard-comic-display');
    const pageEl = html.find('.howard-page')[0];
    if (!pageEl) { this._panelDrawMode = false; return; }

    comicDisplay.addClass('howard-draw-mode');
    html.find('.howard-draw-panel').addClass('active');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const pageRect = pageEl.getBoundingClientRect();

      // Starting position as percentage of page
      const startX = ((ev.clientX - pageRect.left) / pageRect.width) * 100;
      const startY = ((ev.clientY - pageRect.top) / pageRect.height) * 100;

      // Create overlay rectangle
      const overlay = document.createElement('div');
      overlay.className = 'howard-draw-overlay';
      overlay.style.left = `${startX}%`;
      overlay.style.top = `${startY}%`;
      overlay.style.width = '0%';
      overlay.style.height = '0%';
      pageEl.appendChild(overlay);

      const onMove = (e) => {
        const curX = ((e.clientX - pageRect.left) / pageRect.width) * 100;
        const curY = ((e.clientY - pageRect.top) / pageRect.height) * 100;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        overlay.style.left = `${x}%`;
        overlay.style.top = `${y}%`;
        overlay.style.width = `${w}%`;
        overlay.style.height = `${h}%`;
      };

      const onUp = (e) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        overlay.remove();

        const endX = ((e.clientX - pageRect.left) / pageRect.width) * 100;
        const endY = ((e.clientY - pageRect.top) / pageRect.height) * 100;
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);

        // Exit draw mode
        this._exitPanelDrawMode(html);

        // Only create if rectangle has meaningful size (> 3% in both dimensions)
        if (w < 3 || h < 3) return;

        this._createPanel(
          Math.round(x * 10) / 10,
          Math.round(y * 10) / 10,
          Math.round(w * 10) / 10,
          Math.round(h * 10) / 10
        );
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    pageEl.addEventListener('mousedown', onMouseDown);
    this._panelDrawCleanup = () => {
      pageEl.removeEventListener('mousedown', onMouseDown);
      comicDisplay.removeClass('howard-draw-mode');
      html.find('.howard-draw-panel').removeClass('active');
    };
  }

  /** Exit panel draw mode */
  _exitPanelDrawMode(html) {
    if (!this._panelDrawMode) return;
    if (this._panelDrawCleanup) {
      this._panelDrawCleanup();
      this._panelDrawCleanup = null;
    }
    this._panelDrawMode = false;
  }

  /** Create a new freeform panel at the given percentage bounds */
  _createPanel(x, y, width, height) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;

    const panelId = `panel-${Date.now()}`;
    const panels = currentPage.panels || {};
    const images = currentPage.images || {};
    // Start above the highest page image layer AND the highest existing panel z-index
    const maxImageLayer = Object.values(images).reduce((max, img) => Math.max(max, img.layerNum || 0), 0);
    const maxPanelZ = Object.values(panels).reduce((max, p) => Math.max(max, p.zIndex || 0), 0);
    const maxZ = Math.max(maxImageLayer, maxPanelZ);

    const basePath = this._getPageBasePath();
    this.actor.update({
      [`${basePath}.panels.${panelId}`]: {
        id: panelId,
        x, y, width, height,
        zIndex: maxZ + 1,
        content: '',
        layers: {}
      }
    });
  }

  /** Duplicate a panel (same size/position, no images) */
  _onDuplicatePanel(panelId) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;
    const panel = currentPage.panels?.[panelId];
    if (!panel) return;

    const newId = `panel-${Date.now()}`;
    const panels = currentPage.panels || {};
    const images = currentPage.images || {};
    const maxImageLayer = Object.values(images).reduce((max, img) => Math.max(max, img.layerNum || 0), 0);
    const maxPanelZ = Object.values(panels).reduce((max, p) => Math.max(max, p.zIndex || 0), 0);
    const maxZ = Math.max(maxImageLayer, maxPanelZ);

    // Offset slightly so the duplicate is visible (2% down and right)
    const basePath = this._getPageBasePath();
    this.actor.update({
      [`${basePath}.panels.${newId}`]: {
        id: newId,
        x: Math.min(panel.x + 2, 100 - panel.width),
        y: Math.min(panel.y + 2, 100 - panel.height),
        width: panel.width,
        height: panel.height,
        zIndex: maxZ + 1,
        content: '',
        layers: {}
      }
    });
  }

  /** Delete a panel */
  _onDeletePanel(panelId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({
      [`${basePath}.panels.-=${panelId}`]: null
    });
  }

  /** Change a panel's z-index */
  _onPanelZIndexChange(panelId, delta) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;
    const panel = currentPage.panels?.[panelId];
    if (!panel) return;

    const newZ = Math.max(1, (panel.zIndex || 1) + delta);
    const basePath = this._getPageBasePath();
    this.actor.update({
      [`${basePath}.panels.${panelId}.zIndex`]: newZ
    });
  }

  /** Activate panel move mode — drag to reposition on comic display */
  _activatePanelMove(panelId, html) {
    if (this._movePanelId) {
      this._deactivatePanelMove();
    }
    this._movePanelId = panelId;

    // Highlight bullseye button
    this.element.find(`.howard-forge-panel-card[data-panel-id="${panelId}"] .howard-panel-move`).addClass('active');

    // Find panel element on comic display
    const panelEl = this.element.find(`.howard-panel-freeform[data-panel-id="${panelId}"]`)[0];
    if (!panelEl) return;

    panelEl.style.cursor = 'grab';
    panelEl.classList.add('howard-panel-highlight');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const pageEl = panelEl.closest('.howard-page');
      const pageRect = pageEl.getBoundingClientRect();

      const startX = parseFloat(panelEl.style.left) || 0;
      const startY = parseFloat(panelEl.style.top) || 0;
      const startW = parseFloat(panelEl.style.width) || 30;
      const startH = parseFloat(panelEl.style.height) || 30;
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;
      const isResize = ev.shiftKey;

      panelEl.style.cursor = isResize ? 'nwse-resize' : 'grabbing';

      const onMove = (e) => {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        if (isResize) {
          // Shift+drag = resize width/height
          const newW = Math.max(5, startW + (dx / pageRect.width) * 100);
          const newH = Math.max(5, startH + (dy / pageRect.height) * 100);
          panelEl.style.width = `${newW.toFixed(1)}%`;
          panelEl.style.height = `${newH.toFixed(1)}%`;
        } else {
          // Normal drag = move
          const newX = Math.max(-50, Math.min(150, startX + (dx / pageRect.width) * 100));
          const newY = Math.max(-50, Math.min(150, startY + (dy / pageRect.height) * 100));
          panelEl.style.left = `${newX.toFixed(1)}%`;
          panelEl.style.top = `${newY.toFixed(1)}%`;
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        panelEl.style.cursor = 'grab';

        const basePath = this._getPageBasePath();
        if (basePath) {
          if (isResize) {
            const w = Math.round((parseFloat(panelEl.style.width) || 30) * 10) / 10;
            const h = Math.round((parseFloat(panelEl.style.height) || 30) * 10) / 10;
            this.actor.update({
              [`${basePath}.panels.${panelId}.width`]: w,
              [`${basePath}.panels.${panelId}.height`]: h
            }, { render: false });
          } else {
            const posX = Math.round((parseFloat(panelEl.style.left) || 0) * 10) / 10;
            const posY = Math.round((parseFloat(panelEl.style.top) || 0) * 10) / 10;
            this.actor.update({
              [`${basePath}.panels.${panelId}.x`]: posX,
              [`${basePath}.panels.${panelId}.y`]: posY
            }, { render: false });
          }
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    panelEl.addEventListener('mousedown', onMouseDown);
    this._movePanelCleanup = () => {
      panelEl.removeEventListener('mousedown', onMouseDown);
      panelEl.style.cursor = '';
      panelEl.classList.remove('howard-panel-highlight');
    };
  }

  /** Deactivate panel move mode */
  _deactivatePanelMove() {
    if (!this._movePanelId) return;
    if (this._movePanelCleanup) {
      this._movePanelCleanup();
      this._movePanelCleanup = null;
    }
    this.element.find('.howard-panel-move.active').removeClass('active');
    this._movePanelId = null;
  }

  /** Open a dialog to manage images inside a panel (mini PAGE tool) */
  _showPanelImageDialog(panelId) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;
    const panel = currentPage.panels?.[panelId];
    if (!panel) return;

    const basePath = this._getPageBasePath();
    const panelPath = `${basePath}.panels.${panelId}`;

    // Build layer cards HTML
    const layers = panel.layers ? Object.values(panel.layers).sort((a, b) => a.layerNum - b.layerNum) : [];
    const buildCardsHtml = () => {
      const p = this.actor.system.tales[this._activeTaleId];
      if (!p) return '';
      const pages = Object.values(p.pages || {}).sort((a, b) => a.pageNumber - b.pageNumber);
      const pg = pages[this._readerPageIndex];
      if (!pg) return '';
      const pnl = pg.panels?.[panelId];
      if (!pnl) return '';
      const lyrs = pnl.layers ? Object.values(pnl.layers).sort((a, b) => a.layerNum - b.layerNum) : [];

      if (lyrs.length === 0) {
        return '<div style="color:var(--s2-muted);font-size:11px;text-align:center;padding:12px;">No images yet</div>';
      }
      return lyrs.map(l => `
        <div class="howard-pimg-card" data-layer-id="${l.id}">
          <div class="howard-pimg-thumb"><img src="${l.imagePath}" /></div>
          <div class="howard-pimg-controls">
            <span class="howard-forge-card-layer">${l.layerNum}</span>
            <button type="button" class="howard-forge-card-btn howard-pimg-move" title="Move image"><i class="fas fa-crosshairs"></i></button>
            <button type="button" class="howard-forge-card-btn howard-pimg-up" title="Layer up"><i class="fas fa-arrow-up"></i></button>
            <button type="button" class="howard-forge-card-btn howard-pimg-down" title="Layer down"><i class="fas fa-arrow-down"></i></button>
            <button type="button" class="howard-forge-card-btn howard-pimg-delete" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('');
    };

    const content = `
      <div class="howard-pimg-dialog">
        <div class="howard-pimg-grid">${buildCardsHtml()}</div>
        <button type="button" class="howard-forge-add-btn howard-pimg-add" style="margin-top:6px;">
          <i class="fas fa-plus"></i> Add Image
        </button>
      </div>
    `;

    const dlg = new Dialog({
      title: `Panel Images`,
      content,
      buttons: {},
      render: (html) => {
        const refreshCards = () => {
          html.find('.howard-pimg-grid').html(buildCardsHtml());
          attachHandlers();
        };

        const attachHandlers = () => {
          // Add image
          html.find('.howard-pimg-add').off('click').on('click', () => {
            new FilePicker({
              type: "image",
              current: "",
              callback: (path) => {
                const pg = this._getCurrentPage();
                const pnl = pg?.panels?.[panelId];
                const lyrs = pnl?.layers || {};
                const maxLayer = Object.values(lyrs).reduce((max, l) => Math.max(max, l.layerNum || 0), 0);
                const layerId = `layer-${Date.now()}`;
                this.actor.update({
                  [`${panelPath}.layers.${layerId}`]: {
                    id: layerId,
                    imagePath: path,
                    layerNum: maxLayer + 1,
                    posX: 50,
                    posY: 50
                  }
                }).then(() => refreshCards());
              }
            }).render(true);
          });

          // Delete image
          html.find('.howard-pimg-delete').off('click').on('click', (ev) => {
            ev.stopPropagation();
            const layerId = ev.currentTarget.closest('.howard-pimg-card').dataset.layerId;
            this.actor.update({
              [`${panelPath}.layers.-=${layerId}`]: null
            }).then(() => refreshCards());
          });

          // Layer up/down
          html.find('.howard-pimg-up').off('click').on('click', (ev) => {
            ev.stopPropagation();
            const layerId = ev.currentTarget.closest('.howard-pimg-card').dataset.layerId;
            this._panelImageLayerChange(panelPath, layerId, 1).then(() => refreshCards());
          });
          html.find('.howard-pimg-down').off('click').on('click', (ev) => {
            ev.stopPropagation();
            const layerId = ev.currentTarget.closest('.howard-pimg-card').dataset.layerId;
            this._panelImageLayerChange(panelPath, layerId, -1).then(() => refreshCards());
          });

          // Move image (bullseye) — toggle drag mode on the panel's image in comic display
          html.find('.howard-pimg-move').off('click').on('click', (ev) => {
            ev.stopPropagation();
            const layerId = ev.currentTarget.closest('.howard-pimg-card').dataset.layerId;
            this._activatePanelImageMove(panelId, layerId, html);
          });

          // Click thumbnail to change image
          html.find('.howard-pimg-thumb').off('click').on('click', (ev) => {
            const layerId = ev.currentTarget.closest('.howard-pimg-card').dataset.layerId;
            const pg = this._getCurrentPage();
            const lyr = pg?.panels?.[panelId]?.layers?.[layerId];
            new FilePicker({
              type: "image",
              current: lyr?.imagePath || "",
              callback: (path) => {
                this.actor.update({
                  [`${panelPath}.layers.${layerId}.imagePath`]: path
                }).then(() => refreshCards());
              }
            }).render(true);
          });
        };

        attachHandlers();
      },
      close: () => {
        // Clean up any active panel image move
        this._deactivatePanelImageMove();
      }
    }, {
      classes: ["dialog", "howard-dialog-window"],
      width: 340,
      zIndex: 999
    });
    dlg.render(true);
  }

  /** Change a panel image layer's layerNum */
  async _panelImageLayerChange(panelPath, layerId, delta) {
    const pg = this._getCurrentPage();
    if (!pg) return;
    // Re-read the panel from current data to get fresh layerNum
    const pathParts = panelPath.split('.');
    const panelId = pathParts[pathParts.length - 1];
    const lyr = pg.panels?.[panelId]?.layers?.[layerId];
    if (!lyr) return;
    const newLayer = Math.max(1, (lyr.layerNum || 1) + delta);
    await this.actor.update({
      [`${panelPath}.layers.${layerId}.layerNum`]: newLayer
    });
  }

  /** Activate drag-to-reposition for a panel image layer (left/top like page images) */
  _activatePanelImageMove(panelId, layerId, dialogHtml) {
    // Deactivate any previous
    this._deactivatePanelImageMove();

    this._panelImageMoveState = { panelId, layerId };

    // Highlight the bullseye in the dialog
    dialogHtml.find(`.howard-pimg-card[data-layer-id="${layerId}"] .howard-pimg-move`).addClass('active');

    // Find the image in the panel on the comic display
    const panelEl = this.element.find(`.howard-panel-freeform[data-panel-id="${panelId}"]`);
    const imgEl = panelEl.find(`.howard-layer-image[data-layer-id="${layerId}"]`)[0];
    if (!imgEl) return;

    imgEl.style.pointerEvents = 'auto';
    imgEl.style.cursor = 'grab';
    imgEl.classList.add('howard-image-moveable');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const panelRect = panelEl[0].getBoundingClientRect();
      const startPosX = parseFloat(imgEl.style.left) || 0;
      const startPosY = parseFloat(imgEl.style.top) || 0;
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;

      imgEl.style.cursor = 'grabbing';

      const onMove = (e) => {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        const newX = Math.max(-50, Math.min(150, startPosX + (dx / panelRect.width) * 100));
        const newY = Math.max(-50, Math.min(150, startPosY + (dy / panelRect.height) * 100));
        imgEl.style.left = `${newX.toFixed(1)}%`;
        imgEl.style.top = `${newY.toFixed(1)}%`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        imgEl.style.cursor = 'grab';

        const posX = Math.round((parseFloat(imgEl.style.left) || 0) * 10) / 10;
        const posY = Math.round((parseFloat(imgEl.style.top) || 0) * 10) / 10;
        const basePath = this._getPageBasePath();
        if (basePath) {
          this.actor.update({
            [`${basePath}.panels.${panelId}.layers.${layerId}.posX`]: posX,
            [`${basePath}.panels.${panelId}.layers.${layerId}.posY`]: posY
          }, { render: false });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    imgEl.addEventListener('mousedown', onMouseDown, { capture: true });
    this._panelImageMoveCleanup = () => {
      imgEl.removeEventListener('mousedown', onMouseDown, { capture: true });
      imgEl.style.pointerEvents = '';
      imgEl.style.cursor = '';
      imgEl.classList.remove('howard-image-moveable');
    };
  }

  /** Deactivate panel image move */
  _deactivatePanelImageMove() {
    if (this._panelImageMoveCleanup) {
      this._panelImageMoveCleanup();
      this._panelImageMoveCleanup = null;
    }
    this._panelImageMoveState = null;
  }

  /** Activate drag-to-reposition for a panel image layer (left/top + translate(-50%,-50%)) */
  _activatePanelImageMoveInline(panelId, layerId, sheetHtml) {
    this._deactivatePanelImageMove();
    this._panelImageMoveState = { panelId, layerId };

    // Highlight bullseye in inline editor
    sheetHtml.find(`.howard-forge-card[data-layer-id="${layerId}"] .howard-pimg-inline-move`).addClass('active');

    // Find the image in the panel on the comic display
    const panelEl = this.element.find(`.howard-panel-freeform[data-panel-id="${panelId}"]`);
    const imgEl = panelEl.find(`.howard-layer-image[data-layer-id="${layerId}"]`)[0];
    if (!imgEl) return;

    imgEl.style.pointerEvents = 'auto';
    imgEl.style.cursor = 'grab';
    imgEl.classList.add('howard-image-moveable');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const panelRect = panelEl[0].getBoundingClientRect();
      const startPosX = parseFloat(imgEl.style.left) || 50;
      const startPosY = parseFloat(imgEl.style.top) || 50;
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;
      imgEl.style.cursor = 'grabbing';

      const onMove = (e) => {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        const newX = Math.max(-50, Math.min(150, startPosX + (dx / panelRect.width) * 100));
        const newY = Math.max(-50, Math.min(150, startPosY + (dy / panelRect.height) * 100));
        imgEl.style.left = `${newX.toFixed(1)}%`;
        imgEl.style.top = `${newY.toFixed(1)}%`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        imgEl.style.cursor = 'grab';

        const posX = Math.round((parseFloat(imgEl.style.left) || 50) * 10) / 10;
        const posY = Math.round((parseFloat(imgEl.style.top) || 50) * 10) / 10;
        const basePath = this._getPageBasePath();
        if (basePath) {
          this.actor.update({
            [`${basePath}.panels.${panelId}.layers.${layerId}.posX`]: posX,
            [`${basePath}.panels.${panelId}.layers.${layerId}.posY`]: posY
          }, { render: false });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // Shift + scroll wheel = zoom (tracked in variable, not DOM)
    let zoomLevel = parseFloat(imgEl.style.width) || 100;
    let zoomSaveTimeout = null;

    const onWheel = (ev) => {
      if (!ev.shiftKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const delta = ev.deltaY < 0 ? 10 : -10; // scroll up = zoom in
      zoomLevel = Math.max(20, Math.min(500, zoomLevel + delta));
      imgEl.style.width = `${zoomLevel}%`;

      // Debounced save
      if (zoomSaveTimeout) clearTimeout(zoomSaveTimeout);
      zoomSaveTimeout = setTimeout(() => {
        const basePath = this._getPageBasePath();
        if (basePath) {
          this.actor.update({
            [`${basePath}.panels.${panelId}.layers.${layerId}.zoom`]: Math.round(zoomLevel)
          }, { render: false });
        }
      }, 300);
    };

    imgEl.addEventListener('mousedown', onMouseDown, { capture: true });
    imgEl.addEventListener('wheel', onWheel, { passive: false, capture: true });
    this._panelImageMoveCleanup = () => {
      imgEl.removeEventListener('mousedown', onMouseDown, { capture: true });
      imgEl.removeEventListener('wheel', onWheel, { capture: true });
      if (zoomSaveTimeout) clearTimeout(zoomSaveTimeout);
      imgEl.style.pointerEvents = '';
      imgEl.style.cursor = '';
      imgEl.classList.remove('howard-image-moveable');
    };
  }

  /* ------------------------------------------ */
  /*  TEXT Tool Methods                          */
  /* ------------------------------------------ */

  /** Enter text draw mode — draw rectangle to create text box */
  _enterTextDrawMode(html) {
    if (this._textDrawMode) return;
    this._textDrawMode = true;

    const comicDisplay = html.find('.howard-comic-display');
    const pageEl = html.find('.howard-page')[0];
    if (!pageEl) { this._textDrawMode = false; return; }

    comicDisplay.addClass('howard-draw-mode');
    html.find('.howard-draw-text').addClass('active');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const pageRect = pageEl.getBoundingClientRect();
      const startX = ((ev.clientX - pageRect.left) / pageRect.width) * 100;
      const startY = ((ev.clientY - pageRect.top) / pageRect.height) * 100;

      const overlay = document.createElement('div');
      overlay.className = 'howard-draw-overlay';
      overlay.style.left = `${startX}%`;
      overlay.style.top = `${startY}%`;
      overlay.style.width = '0%';
      overlay.style.height = '0%';
      pageEl.appendChild(overlay);

      const onMove = (e) => {
        const curX = ((e.clientX - pageRect.left) / pageRect.width) * 100;
        const curY = ((e.clientY - pageRect.top) / pageRect.height) * 100;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        overlay.style.left = `${x}%`;
        overlay.style.top = `${y}%`;
        overlay.style.width = `${w}%`;
        overlay.style.height = `${h}%`;
      };

      const onUp = (e) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        overlay.remove();

        const endX = ((e.clientX - pageRect.left) / pageRect.width) * 100;
        const endY = ((e.clientY - pageRect.top) / pageRect.height) * 100;
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);

        this._exitTextDrawMode(html);
        if (w < 3 || h < 3) return;

        this._createTextBlock(
          Math.round(x * 10) / 10,
          Math.round(y * 10) / 10,
          Math.round(w * 10) / 10,
          Math.round(h * 10) / 10
        );
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    pageEl.addEventListener('mousedown', onMouseDown);
    this._textDrawCleanup = () => {
      pageEl.removeEventListener('mousedown', onMouseDown);
      comicDisplay.removeClass('howard-draw-mode');
      html.find('.howard-draw-text').removeClass('active');
    };
  }

  /** Exit text draw mode */
  _exitTextDrawMode(html) {
    if (!this._textDrawMode) return;
    if (this._textDrawCleanup) {
      this._textDrawCleanup();
      this._textDrawCleanup = null;
    }
    this._textDrawMode = false;
  }

  /** Create a new text block at the given percentage bounds */
  _createTextBlock(x, y, width, height) {
    const currentPage = this._getCurrentPage();
    if (!currentPage) return;

    const tbId = `tb-${Date.now()}`;
    const textBlocks = currentPage.textBlocks || {};
    const panels = currentPage.panels || {};
    const images = currentPage.images || {};
    const maxImageZ = Object.values(images).reduce((max, img) => Math.max(max, img.layerNum || 0), 0);
    const maxPanelZ = Object.values(panels).reduce((max, p) => Math.max(max, p.zIndex || 0), 0);
    const maxTbZ = Object.values(textBlocks).reduce((max, tb) => Math.max(max, tb.zIndex || 0), 0);
    const maxZ = Math.max(maxImageZ, maxPanelZ, maxTbZ);

    const basePath = this._getPageBasePath();
    this.actor.update({
      [`${basePath}.textBlocks.${tbId}`]: {
        id: tbId,
        x, y, width, height,
        zIndex: maxZ + 1,
        content: '',
        style: 'caption'
      }
    });
  }

  /** Delete a text block */
  _onDeleteTextBlock(tbId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({ [`${basePath}.textBlocks.-=${tbId}`]: null });
  }

  /** Change text block z-index */
  _onTextZIndexChange(tbId, delta) {
    const pg = this._getCurrentPage();
    if (!pg) return;
    const tb = pg.textBlocks?.[tbId];
    if (!tb) return;
    const newZ = Math.max(1, (tb.zIndex || 1) + delta);
    const basePath = this._getPageBasePath();
    this.actor.update({ [`${basePath}.textBlocks.${tbId}.zIndex`]: newZ });
  }

  /** Activate text block move mode — drag to move, shift+drag to resize */
  _activateTextMove(tbId, html) {
    if (this._moveTextId) this._deactivateTextMove();
    this._moveTextId = tbId;

    html.find(`.howard-forge-text-card[data-tb-id="${tbId}"] .howard-text-move`).addClass('active');

    const tbEl = this.element.find(`.howard-text-freeform[data-tb-id="${tbId}"]`)[0];
    if (!tbEl) return;

    tbEl.style.cursor = 'grab';
    tbEl.classList.add('howard-text-highlight');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const pageEl = tbEl.closest('.howard-page');
      const pageRect = pageEl.getBoundingClientRect();

      const startX = parseFloat(tbEl.style.left) || 0;
      const startY = parseFloat(tbEl.style.top) || 0;
      const startW = parseFloat(tbEl.style.width) || 30;
      const startH = parseFloat(tbEl.style.height) || 15;
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;
      const isResize = ev.shiftKey;

      tbEl.style.cursor = isResize ? 'nwse-resize' : 'grabbing';

      const onMove = (e) => {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        if (isResize) {
          const newW = Math.max(5, startW + (dx / pageRect.width) * 100);
          const newH = Math.max(5, startH + (dy / pageRect.height) * 100);
          tbEl.style.width = `${newW.toFixed(1)}%`;
          tbEl.style.height = `${newH.toFixed(1)}%`;
        } else {
          const newX = Math.max(-50, Math.min(150, startX + (dx / pageRect.width) * 100));
          const newY = Math.max(-50, Math.min(150, startY + (dy / pageRect.height) * 100));
          tbEl.style.left = `${newX.toFixed(1)}%`;
          tbEl.style.top = `${newY.toFixed(1)}%`;
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        tbEl.style.cursor = 'grab';

        const basePath = this._getPageBasePath();
        if (basePath) {
          if (isResize) {
            const w = Math.round((parseFloat(tbEl.style.width) || 30) * 10) / 10;
            const h = Math.round((parseFloat(tbEl.style.height) || 15) * 10) / 10;
            this.actor.update({
              [`${basePath}.textBlocks.${tbId}.width`]: w,
              [`${basePath}.textBlocks.${tbId}.height`]: h
            }, { render: false });
          } else {
            const posX = Math.round((parseFloat(tbEl.style.left) || 0) * 10) / 10;
            const posY = Math.round((parseFloat(tbEl.style.top) || 0) * 10) / 10;
            this.actor.update({
              [`${basePath}.textBlocks.${tbId}.x`]: posX,
              [`${basePath}.textBlocks.${tbId}.y`]: posY
            }, { render: false });
          }
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    tbEl.addEventListener('mousedown', onMouseDown);
    this._moveTextCleanup = () => {
      tbEl.removeEventListener('mousedown', onMouseDown);
      tbEl.style.cursor = '';
      tbEl.classList.remove('howard-text-highlight');
    };
  }

  /** Deactivate text block move */
  _deactivateTextMove() {
    if (this._moveTextCleanup) {
      this._moveTextCleanup();
      this._moveTextCleanup = null;
    }
    this._moveTextId = null;
  }

  /* ------------------------------------------ */
  /*  SPEECH Tool — Tail Geometry + Methods     */
  /* ------------------------------------------ */

  /**
   * Compute SVG polygon points for a speech bubble tail.
   * Ray from bubble center → tail tip, intersect with bubble rectangle,
   * spread two base points perpendicular along the edge.
   * @returns {string|null} SVG points string "b1x,b1y tipX,tipY b2x,b2y" or null
   */
  _computeTailGeometry(sb) {
    const x = sb.x ?? sb.posX ?? 0;
    const y = sb.y ?? sb.posY ?? 0;
    const w = sb.width ?? 25;
    const h = sb.height ?? 10;
    const tx = sb.tailTipX;
    const ty = sb.tailTipY;
    if (tx == null || ty == null) return null;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null; // tip at center

    const hw = w / 2;
    const hh = h / 2;

    // Find smallest positive t where ray hits rectangle edge
    let t = Infinity;
    if (dx > 0) t = Math.min(t, hw / dx);
    else if (dx < 0) t = Math.min(t, -hw / dx);
    if (dy > 0) t = Math.min(t, hh / dy);
    else if (dy < 0) t = Math.min(t, -hh / dy);

    // Intersection point on bubble edge
    const ix = cx + dx * t;
    const iy = cy + dy * t;

    // Perpendicular direction for base spread
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len;
    const py = dx / len;
    const spread = 1.2; // percentage units

    const b1x = (ix + px * spread).toFixed(2);
    const b1y = (iy + py * spread).toFixed(2);
    const b2x = (ix - px * spread).toFixed(2);
    const b2y = (iy - py * spread).toFixed(2);

    return `${b1x},${b1y} ${tx.toFixed(2)},${ty.toFixed(2)} ${b2x},${b2y}`;
  }

  _enterSpeechDrawMode(html) {
    if (this._speechDrawMode) return;
    this._speechDrawMode = true;

    const display = html.find('.howard-comic-display');
    const pageEl = html.find('.howard-page')[0];
    if (!pageEl) { this._speechDrawMode = false; return; }

    display.addClass('howard-draw-mode');
    html.find('.howard-draw-speech').addClass('active');

    let startX, startY, overlay;

    const onMousedown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = pageEl.getBoundingClientRect();
      startX = ((ev.clientX - rect.left) / rect.width) * 100;
      startY = ((ev.clientY - rect.top) / rect.height) * 100;

      overlay = document.createElement('div');
      overlay.className = 'howard-draw-overlay';
      overlay.style.cssText = `position:absolute;left:${startX}%;top:${startY}%;width:0;height:0;border:2px dashed #fff;background:rgba(255,255,255,0.15);pointer-events:none;z-index:9999;border-radius:14px;`;
      pageEl.appendChild(overlay);

      const onMousemove = (e) => {
        const curX = ((e.clientX - rect.left) / rect.width) * 100;
        const curY = ((e.clientY - rect.top) / rect.height) * 100;
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        overlay.style.left = `${left}%`;
        overlay.style.top = `${top}%`;
        overlay.style.width = `${w}%`;
        overlay.style.height = `${h}%`;
      };

      const onMouseup = (e) => {
        document.removeEventListener('mousemove', onMousemove);
        document.removeEventListener('mouseup', onMouseup);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;

        const endX = ((e.clientX - rect.left) / rect.width) * 100;
        const endY = ((e.clientY - rect.top) / rect.height) * 100;
        const x = Math.max(0, Math.min(startX, endX));
        const y = Math.max(0, Math.min(startY, endY));
        const w = Math.max(5, Math.abs(endX - startX));
        const h = Math.max(3, Math.abs(endY - startY));

        this._exitSpeechDrawMode(html);
        this._createSpeechBubble(x, y, w, h);
      };

      document.addEventListener('mousemove', onMousemove);
      document.addEventListener('mouseup', onMouseup);
    };

    pageEl.addEventListener('mousedown', onMousedown);

    this._speechDrawCleanup = () => {
      pageEl.removeEventListener('mousedown', onMousedown);
      display.removeClass('howard-draw-mode');
      html.find('.howard-draw-speech').removeClass('active');
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      this._speechDrawMode = false;
    };
  }

  _exitSpeechDrawMode(html) {
    if (this._speechDrawCleanup) {
      this._speechDrawCleanup();
      this._speechDrawCleanup = null;
    }
    this._speechDrawMode = false;
  }

  _createSpeechBubble(x, y, width, height) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    const sbId = `sb-${Date.now()}`;

    // Find max z-index across all layers
    const page = this._getCurrentPage();
    let maxZ = 10;
    if (page) {
      const panels = page.panels ? Object.values(page.panels) : [];
      const tbs = page.textBlocks ? Object.values(page.textBlocks) : [];
      const sbs = page.speechBubbles ? Object.values(page.speechBubbles) : [];
      const imgs = page.images ? Object.values(page.images) : [];
      [...panels, ...tbs, ...sbs, ...imgs].forEach(el => {
        const z = el.zIndex ?? el.layerNum ?? 0;
        if (z > maxZ) maxZ = z;
      });
    }

    // Default tail tip: below bubble center
    const tailTipX = x + width / 2;
    const tailTipY = y + height + 10;

    this.actor.update({
      [`${basePath}.speechBubbles.${sbId}`]: {
        id: sbId,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
        zIndex: maxZ + 1,
        content: '',
        tailTipX: Math.round(tailTipX * 10) / 10,
        tailTipY: Math.round(tailTipY * 10) / 10
      }
    });
  }

  _onDeleteSpeechBubble(sbId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    this.actor.update({ [`${basePath}.speechBubbles.-=${sbId}`]: null });
  }

  _onSpeechZIndexChange(sbId, delta) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;
    const page = this._getCurrentPage();
    const sb = page?.speechBubbles?.[sbId];
    if (!sb) return;
    const newZ = Math.max(1, (sb.zIndex || 1) + delta);
    this.actor.update({ [`${basePath}.speechBubbles.${sbId}.zIndex`]: newZ });
  }

  _activateSpeechMove(sbId, html) {
    if (this._moveSpeechId) this._deactivateSpeechMove();
    this._moveSpeechId = sbId;

    // Highlight card
    html.find(`.howard-forge-speech-card[data-sb-id="${sbId}"] .howard-speech-move`).addClass('active');

    const sbEl = this.element.find(`.howard-speech-freeform[data-sb-id="${sbId}"]`)[0];
    if (!sbEl) return;
    sbEl.classList.add('howard-speech-moving');
    sbEl.style.cursor = 'grab';

    const pageEl = sbEl.closest('.howard-page');
    if (!pageEl) return;

    const onMousedown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();

      const rect = pageEl.getBoundingClientRect();
      const startMX = ev.clientX;
      const startMY = ev.clientY;
      const startL = parseFloat(sbEl.style.left) || 0;
      const startT = parseFloat(sbEl.style.top) || 0;
      const startW = parseFloat(sbEl.style.width) || 25;
      const startH = parseFloat(sbEl.style.height) || 10;
      const isResize = ev.shiftKey;

      sbEl.style.cursor = isResize ? 'nwse-resize' : 'grabbing';

      const onMove = (e) => {
        const dx = ((e.clientX - startMX) / rect.width) * 100;
        const dy = ((e.clientY - startMY) / rect.height) * 100;

        if (isResize) {
          const newW = Math.max(5, startW + dx);
          const newH = Math.max(3, startH + dy);
          sbEl.style.width = `${newW.toFixed(1)}%`;
          sbEl.style.height = `${newH.toFixed(1)}%`;
        } else {
          sbEl.style.left = `${(startL + dx).toFixed(1)}%`;
          sbEl.style.top = `${(startT + dy).toFixed(1)}%`;
        }
      };

      const onUp = (e) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        sbEl.style.cursor = 'grab';

        const basePath = this._getPageBasePath();
        if (!basePath) return;

        if (isResize) {
          this.actor.update({
            [`${basePath}.speechBubbles.${sbId}.width`]: Math.round(parseFloat(sbEl.style.width) * 10) / 10,
            [`${basePath}.speechBubbles.${sbId}.height`]: Math.round(parseFloat(sbEl.style.height) * 10) / 10
          }, { render: false });
        } else {
          this.actor.update({
            [`${basePath}.speechBubbles.${sbId}.x`]: Math.round(parseFloat(sbEl.style.left) * 10) / 10,
            [`${basePath}.speechBubbles.${sbId}.y`]: Math.round(parseFloat(sbEl.style.top) * 10) / 10
          }, { render: false });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sbEl.addEventListener('mousedown', onMousedown);

    this._moveSpeechCleanup = () => {
      sbEl.removeEventListener('mousedown', onMousedown);
      sbEl.classList.remove('howard-speech-moving');
      sbEl.style.cursor = '';
      html.find(`.howard-forge-speech-card[data-sb-id="${sbId}"] .howard-speech-move`).removeClass('active');
      this._moveSpeechId = null;
    };
  }

  _deactivateSpeechMove() {
    if (this._moveSpeechCleanup) {
      this._moveSpeechCleanup();
      this._moveSpeechCleanup = null;
    }
    this._moveSpeechId = null;
  }

  _activateSpeechAim(sbId, html) {
    if (this._speechAimId) this._deactivateSpeechAim();
    this._speechAimId = sbId;

    const display = this.element.find('.howard-comic-display');
    const pageEl = this.element.find('.howard-page')[0];
    if (!pageEl) return;

    display.addClass('howard-aim-mode');
    html.find(`.howard-forge-speech-card[data-sb-id="${sbId}"] .howard-speech-aim`).addClass('active');

    const onClick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const rect = pageEl.getBoundingClientRect();
      const tipX = ((ev.clientX - rect.left) / rect.width) * 100;
      const tipY = ((ev.clientY - rect.top) / rect.height) * 100;

      const basePath = this._getPageBasePath();
      if (basePath) {
        this.actor.update({
          [`${basePath}.speechBubbles.${sbId}.tailTipX`]: Math.round(tipX * 10) / 10,
          [`${basePath}.speechBubbles.${sbId}.tailTipY`]: Math.round(tipY * 10) / 10
        });
      }

      this._deactivateSpeechAim();
    };

    pageEl.addEventListener('click', onClick, { once: true });

    this._speechAimCleanup = () => {
      pageEl.removeEventListener('click', onClick);
      display.removeClass('howard-aim-mode');
      html.find(`.howard-forge-speech-card[data-sb-id="${sbId}"] .howard-speech-aim`).removeClass('active');
      this._speechAimId = null;
    };
  }

  _deactivateSpeechAim() {
    if (this._speechAimCleanup) {
      this._speechAimCleanup();
      this._speechAimCleanup = null;
    }
    this._speechAimId = null;
  }

  /* ------------------------------------------ */
  /*  Page Scaling (fixed size + transform)     */
  /* ------------------------------------------ */

  _setupPageScaling(html) {
    // Clean up previous observer
    if (this._pageResizeObserver) {
      this._pageResizeObserver.disconnect();
      this._pageResizeObserver = null;
    }

    const scalerEl = html.find('.howard-page-scaler')[0];
    const pageEl = scalerEl?.querySelector('.howard-page');
    if (!scalerEl || !pageEl) return;

    const comicDisplay = html.find('.howard-comic-display')[0];
    const prevArrow = comicDisplay?.querySelector('.howard-page-prev');
    const nextArrow = comicDisplay?.querySelector('.howard-page-next');

    const applyScale = () => {
      const availW = scalerEl.clientWidth;
      const availH = scalerEl.clientHeight;
      if (availW === 0 || availH === 0) return;
      const scale = Math.min(1, availW / 520, availH / 780);
      pageEl.style.transform = `scale(${scale})`;

      // Reposition arrows to track the scaled page
      const scaledW = 520 * scale;
      const scaledH = 780 * scale;
      // Determine page offset within scaler based on transform-origin / alignment
      const style = getComputedStyle(scalerEl);
      const isTopLeft = style.alignItems === 'flex-start';
      const pageTop = isTopLeft ? 0 : (availH - scaledH) / 2;
      const pageLeft = isTopLeft ? 0 : (availW - scaledW) / 2;
      const pageMidY = pageTop + scaledH / 2;

      if (prevArrow) {
        prevArrow.style.top = `${pageMidY}px`;
        // Sit in margin if room, otherwise overlap page edge
        const idealLeft = pageLeft - 44;
        prevArrow.style.left = `${Math.max(4, idealLeft)}px`;
      }
      if (nextArrow) {
        nextArrow.style.top = `${pageMidY}px`;
        // Sit in margin if room, otherwise overlap page edge
        const idealRight = availW - (pageLeft + scaledW) - 44;
        nextArrow.style.right = `${Math.max(4, idealRight)}px`;
        nextArrow.style.left = 'auto';
      }
    };

    // Apply immediately
    applyScale();

    // Watch for size changes
    this._pageResizeObserver = new ResizeObserver(applyScale);
    this._pageResizeObserver.observe(scalerEl);
  }

  _teardownPageScaling() {
    if (this._pageResizeObserver) {
      this._pageResizeObserver.disconnect();
      this._pageResizeObserver = null;
    }
  }

  /* ------------------------------------------ */
  /*  Rack Rendering                            */
  /* ------------------------------------------ */

  _renderRack(track, talesList) {
    const count = talesList.length;
    track.empty().removeClass('single-tale two-tales');

    if (count === 1) {
      track.addClass('single-tale');
      const card = this._buildCoverCard(talesList[0], 'center');
      card.on('click', () => this._onOpenIssue(talesList[0].id));
      track.append(card);
      return;
    }

    if (count === 2) {
      track.addClass('two-tales');
      talesList.forEach(tale => {
        const card = this._buildCoverCard(tale, 'center');
        card.on('click', () => this._onOpenIssue(tale.id));
        track.append(card);
      });
      return;
    }

    // 3+ tales: full rack with left-center-right
    const leftIdx = this._wrapIndex(this._currentIndex - 1, count);
    const centerIdx = this._currentIndex;
    const rightIdx = this._wrapIndex(this._currentIndex + 1, count);

    const leftCard = this._buildCoverCard(talesList[leftIdx], 'left');
    const centerCard = this._buildCoverCard(talesList[centerIdx], 'center');
    const rightCard = this._buildCoverCard(talesList[rightIdx], 'right');

    // Click center to open
    centerCard.on('click', () => this._onOpenIssue(talesList[centerIdx].id));

    // Click side previews to navigate
    const html = track.closest('form');
    leftCard.on('click', () => this._navigate(-1, html, talesList));
    rightCard.on('click', () => this._navigate(1, html, talesList));

    // Double-click any card to open it directly (especially useful for players)
    leftCard.on('dblclick', (e) => { e.stopPropagation(); this._onOpenIssue(talesList[leftIdx].id); });
    rightCard.on('dblclick', (e) => { e.stopPropagation(); this._onOpenIssue(talesList[rightIdx].id); });

    track.append(leftCard, centerCard, rightCard);
  }

  _buildCoverCard(tale, position) {
    const defaultImg = 'modules/howard-chronicler/images/howard.png';
    const coverSrc = tale.coverImage || defaultImg;

    return $(`
      <div class="howard-cover-slot ${position}" data-tale-id="${tale.id}">
        <div class="howard-cover">
          <img src="${coverSrc}" alt="${tale.title}">
          <div class="howard-cover-overlay">
            <div class="issue-number">Issue #${tale.issueNumber}</div>
            <div class="issue-title">${tale.title}</div>
          </div>
        </div>
      </div>
    `);
  }

  /* ------------------------------------------ */
  /*  Rack Navigation                           */
  /* ------------------------------------------ */

  _navigate(direction, html, talesList) {
    if (this._isAnimating) return;
    const count = talesList.length;
    if (count < 3) return;

    this._isAnimating = true;
    this._currentIndex = this._wrapIndex(this._currentIndex + direction, count);

    const track = html.find('.howard-rack-track');
    this._renderRack(track, talesList);

    const animClass = direction > 0 ? 'slide-in-from-right' : 'slide-in-from-left';
    track.find('.howard-cover-slot.center').addClass(animClass);

    setTimeout(() => {
      this._isAnimating = false;
      track.find('.howard-cover-slot').removeClass('slide-in-from-left slide-in-from-right');
    }, 420);
  }

  _wrapIndex(index, count) {
    return ((index % count) + count) % count;
  }

  /* ------------------------------------------ */
  /*  Rack Drag / Swipe                         */
  /* ------------------------------------------ */

  _attachDragHandlers(html, talesList) {
    const rackEl = html.find('.howard-rack-viewport')[0];
    if (!rackEl) return;

    const SWIPE_THRESHOLD = 50;
    const CLICK_THRESHOLD = 8;

    rackEl.addEventListener('pointerdown', (e) => {
      if (this._isAnimating) return;
      this._dragState = { startX: e.clientX };
      this._rackDragged = false;
      rackEl.setPointerCapture(e.pointerId);
    });

    rackEl.addEventListener('pointermove', (e) => {
      if (!this._dragState) return;
      if (Math.abs(e.clientX - this._dragState.startX) > CLICK_THRESHOLD) {
        this._rackDragged = true;
      }
    });

    rackEl.addEventListener('pointerup', (e) => {
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.startX;
      this._dragState = null;

      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        this._navigate(dx < 0 ? 1 : -1, html, talesList);
      }
    });

    rackEl.addEventListener('pointercancel', () => {
      this._dragState = null;
    });
  }

  /* ------------------------------------------ */
  /*  Open Issue / Back to Rack                 */
  /* ------------------------------------------ */

  _onOpenIssue(taleId) {
    const tale = this.actor.system.tales[taleId];
    if (!tale) return;

    this._viewMode = 'reader';
    this._activeTaleId = taleId;
    this._readerPageIndex = tale.currentPage || 0;

    // Only GM persists state — players navigate locally
    if (game.user.isGM) {
      this.actor.update({ 'system.activeTale': taleId }, { render: false });
    }
    this.render(false);
    this._updateWindowTitle();
  }

  _onBackToRack() {
    this._teardownPageScaling();
    // Save current page position (GM only — players navigate locally)
    if (this._activeTaleId && game.user.isGM) {
      this.actor.update({
        [`system.tales.${this._activeTaleId}.currentPage`]: this._readerPageIndex,
        'system.activeTale': null
      }, { render: false });
    }

    this._viewMode = 'rack';
    this._activeTaleId = null;
    this._readerPageIndex = 0;
    this._editorMode = 'gm';
    this._forgeTool = 'page';
    this._editMode = false;
    this._selectedPanelId = null;
    this._unlockedPanelId = null;
    this._lastDeleted = null;
    this._activeTool = null;
    this._cleanupLayerDrag();
    this._moveMode = false;
    this._moveLayerId = null;
    this._pendingPositions = {};
    this._cancelTextBlockPlacement();
    this._cancelSkillMarkerPlacement();
    // Clean up forge tool states
    this._deactivateSpeechMove();
    this._deactivateSpeechAim();
    this._speechDrawMode = false;
    this._speechDrawCleanup = null;
    this._speechEditId = null;
    this._deactivateTextMove();
    this._textDrawMode = false;
    this._textDrawCleanup = null;
    this._textEditId = null;
    this._cancelCheckPlacement();
    this._deactivateCheckMove();
    this._checkEditId = null;
    this.render(false);
    this._updateWindowTitle();
  }

  /** Update the Foundry window title bar text to match current state */
  _updateWindowTitle() {
    const titleEl = this.element?.[0]?.closest('.app')?.querySelector('.window-title');
    if (titleEl) titleEl.textContent = this.title;
  }

  /* ------------------------------------------ */
  /*  Page Navigation                           */
  /* ------------------------------------------ */

  /** Returns display label for current page index (-1 = Cover, 0+ = Page N) */
  _getPageLabel(index = this._readerPageIndex) {
    return index === -1 ? 'Cover' : `Page ${index + 1}`;
  }

  _navigatePage(direction) {
    if (this._isAnimating) return;
    if (this._isMoving) return;
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;

    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const pageCount = pages.length;
    let newIndex = this._readerPageIndex + direction;
    if (newIndex < -1 || newIndex >= pageCount) return; // -1 = cover page

    // Non-GM: skip hidden pages
    if (!game.user.isGM) {
      const hiddenPages = tale.hiddenPages || {};
      while (newIndex >= 0 && newIndex < pageCount && hiddenPages[pages[newIndex].id]) {
        newIndex += direction;
      }
      if (newIndex < -1 || newIndex >= pageCount) return; // no visible page in this direction
    }

    this._isAnimating = true;
    this._readerPageIndex = newIndex;
    this._selectedPanelId = null;
    this._unlockedPanelId = null;
    this.render(false);

    setTimeout(() => { this._isAnimating = false; }, 350);
  }

  _attachPageDragHandlers(html) {
    const readerEl = html.find('.howard-reader-viewport')[0];
    if (!readerEl) return;
    const THRESHOLD = 60;

    readerEl.addEventListener('pointerdown', (e) => {
      if (this._isAnimating) return;
      if (this._isMoving) return; // Don't capture swipe during any move mode
      if (e.target.closest('.howard-viewer-bar')) return; // Don't capture buttons
      if (e.target.closest('.howard-page-back-btn')) return; // Don't capture back button
      if (e.target.closest('.howard-skill-marker')) return; // Don't capture skill marker clicks
      if (e.target.closest('.howard-check-marker')) return; // Don't capture check marker clicks
      if (e.target.closest('.howard-gm-notes-indicator')) return; // Don't capture GM notes clicks
      this._dragState = { startX: e.clientX };
      readerEl.setPointerCapture(e.pointerId);
    });

    readerEl.addEventListener('pointerup', (e) => {
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.startX;
      this._dragState = null;
      if (Math.abs(dx) > THRESHOLD) {
        this._navigatePage(dx < 0 ? 1 : -1);
      }
    });

    readerEl.addEventListener('pointercancel', () => {
      this._dragState = null;
    });
  }

  /* ------------------------------------------ */
  /*  Edit Sidebar                              */
  /* ------------------------------------------ */

  /* Removed: _toggleEditMode, _deletePanel, _undoDeletePanel — old sidebar edit UI, replaced by forge tools */

  _selectPanel(html, panelId) {
    // Highlight panel on the page
    html.find('.howard-panel').removeClass('selected');
    html.find(`.howard-panel[data-panel-id="${panelId}"]`).addClass('selected');
    this._selectedPanelId = panelId;

    // Get panel data
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;
    const panel = currentPage.panels[panelId];
    if (!panel) return;

    // Highlight matching tool button
    html.find('.howard-tool-btn[data-tool]').removeClass('active');
    html.find(`.howard-tool-btn[data-tool="${panel.type}"]`).addClass('active');

    // Populate sidebar editor
    this._populateSidebarEditor(html, panel);
  }

  _onToolSelect(html, toolType) {
    // Update active tool button
    html.find('.howard-tool-btn[data-tool]').removeClass('active');
    html.find(`.howard-tool-btn[data-tool="${toolType}"]`).addClass('active');

    if (!this._selectedPanelId) return;

    // Get current panel data and rebuild editor with new type
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;
    const panel = currentPage.panels[this._selectedPanelId];
    if (!panel) return;

    // Preserve content where applicable, switch type
    const fakePanel = { ...panel, type: toolType };
    this._populateSidebarEditor(html, fakePanel);
  }

  _populateSidebarEditor(html, panel) {
    const editorEl = html.find('.howard-sidebar-editor');
    const fieldsHtml = this._buildSidebarFieldsHTML(panel);
    editorEl.html(`
      ${fieldsHtml}
      <input type="hidden" name="sidebarPanelType" value="${panel.type}" />
      <button type="button" class="howard-sidebar-save-btn">
        <i class="fas fa-save"></i> Save
      </button>
    `);
  }

  _buildSidebarFieldsHTML(panel) {
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    switch (panel.type) {
      case 'narration':
        return `
          <label>Narration</label>
          <textarea name="content" rows="4" placeholder="The wind howled across the desolate plains...">${esc(panel.content)}</textarea>`;

      case 'dialogue':
        return `
          <label>Character</label>
          <input type="text" name="characterName" value="${esc(panel.characterName)}" placeholder="Conan" />
          <label>Dialogue</label>
          <textarea name="content" rows="3" placeholder="By Crom!">${esc(panel.content)}</textarea>`;

      case 'read-aloud':
        return `
          <label>Read Aloud</label>
          <textarea name="content" rows="4" placeholder="You enter a dimly lit chamber...">${esc(panel.content)}</textarea>`;

      case 'gm-note':
        return `
          <label>GM Note</label>
          <textarea name="content" rows="4" placeholder="The trap triggers when...">${esc(panel.content)}</textarea>`;

      case 'skill-check':
        return `
          <label>Skill</label>
          <input type="text" name="skillName" value="${esc(panel.skillName)}" placeholder="Athletics" />
          <label>DC</label>
          <input type="number" name="dc" value="${panel.dc || ''}" min="1" placeholder="2" />
          <label>Success</label>
          <textarea name="successText" rows="2" placeholder="You leap across the chasm...">${esc(panel.successText)}</textarea>
          <label>Failure</label>
          <textarea name="failText" rows="2" placeholder="You fall short and tumble...">${esc(panel.failText)}</textarea>`;

      case 'image':
        return `
          <label>Image</label>
          <div class="howard-sidebar-image-preview">
            ${panel.imagePath
              ? `<img src="${panel.imagePath}">`
              : '<i class="fas fa-image" style="color:var(--s2-muted);font-size:20px;"></i>'}
          </div>
          <input type="hidden" name="imagePath" value="${esc(panel.imagePath)}" />
          <label>Caption</label>
          <input type="text" name="content" value="${esc(panel.content)}" placeholder="The tower loomed overhead..." />`;

      default:
        return `
          <label>Content</label>
          <textarea name="content" rows="4">${esc(panel.content)}</textarea>`;
    }
  }

  _saveSidebarEdit(html) {
    if (!this._selectedPanelId || !this._activeTaleId) return;

    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;
    const panel = currentPage.panels[this._selectedPanelId];
    if (!panel) return;

    const editor = html.find('.howard-sidebar-editor');
    const type = editor.find('input[name="sidebarPanelType"]').val() || panel.type;
    const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}.panels.${this._selectedPanelId}`;

    const updateData = {
      [`${basePath}.type`]: type,
      [`${basePath}.content`]: editor.find('[name="content"]').val() || '',
      [`${basePath}.slot`]: panel.slot
    };

    if (type === 'dialogue') {
      updateData[`${basePath}.characterName`] = editor.find('[name="characterName"]').val() || '';
    }
    if (type === 'skill-check') {
      updateData[`${basePath}.skillName`] = editor.find('[name="skillName"]').val() || '';
      updateData[`${basePath}.dc`] = parseInt(editor.find('[name="dc"]').val()) || 1;
      updateData[`${basePath}.successText`] = editor.find('[name="successText"]').val() || '';
      updateData[`${basePath}.failText`] = editor.find('[name="failText"]').val() || '';
    }
    if (type === 'image') {
      updateData[`${basePath}.imagePath`] = editor.find('[name="imagePath"]').val() || '';
    }

    this.actor.update(updateData);
  }

  /* ------------------------------------------ */
  /*  Image Layers                              */
  /* ------------------------------------------ */

  _showAddImageDialog(slot) {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    // Find existing layers for this slot
    const layersObj = currentPage.layers || {};
    const existingLayers = Object.values(layersObj)
      .filter(l => l.slot === slot)
      .sort((a, b) => a.layerNum - b.layerNum);

    // Default layer number = next available
    const usedNums = existingLayers.map(l => l.layerNum);
    let defaultNum = 1;
    while (usedNums.includes(defaultNum)) defaultNum++;

    // Build existing layers grid (3 per row)
    const layerCardsHtml = existingLayers.map(l => `
      <div class="howard-lgrid-card" data-layer-id="${l.id}">
        <div class="howard-lgrid-thumb">
          <img src="${l.imagePath}" />
          <button type="button" class="howard-lgrid-delete" title="Delete layer"><i class="fas fa-trash"></i></button>
        </div>
        <div class="howard-lgrid-label">
          <span>Layer</span>
          <input type="number" class="howard-lgrid-num" value="${l.layerNum}" min="1" data-layer-id="${l.id}" />
        </div>
      </div>
    `).join('');

    // "Add new" card is always the last card in the grid
    const addCardHtml = `
      <div class="howard-lgrid-card howard-lgrid-add-card">
        <div class="howard-lgrid-thumb howard-lgrid-add-thumb">
          <i class="fas fa-plus"></i>
        </div>
        <div class="howard-lgrid-label">
          <span>Layer</span>
          <input type="number" class="howard-lgrid-num howard-lgrid-new-num" value="${defaultNum}" min="1" />
        </div>
      </div>
    `;

    const dlg = new Dialog({
      title: `Slot ${slot + 1} — Layers`,
      content: `
        <div class="howard-lgrid-dialog">
          <div class="howard-lgrid-grid">
            ${layerCardsHtml}
            ${addCardHtml}
          </div>
          <div class="howard-lgrid-footer">
            <button type="button" class="howard-lgrid-move-btn" title="Toggle move mode to reposition layers">
              <i class="fas fa-arrows-alt"></i> Move
            </button>
            <button type="button" class="howard-lgrid-done-btn" title="Close">
              <i class="fas fa-check"></i>
            </button>
          </div>
        </div>
      `,
      buttons: {},
      render: (html) => {
        // --- Card selection (for move mode) ---
        html.find('.howard-lgrid-card:not(.howard-lgrid-add-card)').click((ev) => {
          // If clicking delete button, let that handler take over
          if (ev.target.closest('.howard-lgrid-delete')) return;

          const card = ev.currentTarget;
          const layerId = card.dataset.layerId;

          if (this._moveMode) {
            // In move mode: select this layer for dragging
            // Save previous layer position if switching
            if (this._moveLayerId && this._moveLayerId !== layerId) {
              this._captureLayerPosition();
            }
            this._cleanupLayerDrag();
            html.find('.howard-lgrid-card').removeClass('selected');
            card.classList.add('selected');
            this._moveLayerId = layerId;
            this._setupLayerDrag();
          } else {
            // Not in move mode: open FilePicker to replace image
            const layer = (currentPage.layers || {})[layerId];
            if (!layer) return;
            new FilePicker({
              type: "image",
              current: layer.imagePath,
              callback: (path) => {
                const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}.layers.${layerId}`;
                this.actor.update({ [`${basePath}.imagePath`]: path });
                dlg.close();
                setTimeout(() => this._showAddImageDialog(slot), 150);
              }
            }).render(true);
          }
        });

        // --- Click "add" card thumbnail → open FilePicker ---
        html.find('.howard-lgrid-add-thumb').click(() => {
          if (this._moveMode) return; // Disabled during move mode
          new FilePicker({
            type: "image",
            current: "",
            callback: (path) => {
              const num = parseInt(html.find('.howard-lgrid-new-num').val()) || 1;
              this._addImageLayer(slot, num, path);
              dlg.close();
              setTimeout(() => this._showAddImageDialog(slot), 150);
            }
          }).render(true);
        });

        // --- Delete layer button ---
        html.find('.howard-lgrid-delete').click((ev) => {
          ev.stopPropagation();
          if (this._moveMode) return; // Disabled during move mode
          const card = ev.currentTarget.closest('.howard-lgrid-card');
          const layerId = card.dataset.layerId;
          const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}`;
          this.actor.update({ [`${basePath}.layers.-=${layerId}`]: null });
          dlg.close();
          setTimeout(() => this._showAddImageDialog(slot), 150);
        });

        // --- Edit layer number ---
        html.find('.howard-lgrid-num:not(.howard-lgrid-new-num)').on('change', (ev) => {
          if (this._moveMode) return; // Disabled during move mode
          const input = ev.currentTarget;
          const layerId = input.dataset.layerId;
          const newNum = parseInt(input.value) || 1;
          const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}.layers.${layerId}`;
          this.actor.update({ [`${basePath}.layerNum`]: newNum });
        });

        // --- Move toggle button ---
        html.find('.howard-lgrid-move-btn').click(() => {
          const moveBtn = html.find('.howard-lgrid-move-btn');
          const doneBtn = html.find('.howard-lgrid-done-btn');

          if (this._moveMode) {
            // Deactivate move mode — SAVE positions (Lock → Move)
            this._captureLayerPosition();
            this._cleanupLayerDrag();
            this._savePendingPositions();
            this._moveMode = false;
            this._moveLayerId = null;
            moveBtn.removeClass('active').html('<i class="fas fa-arrows-alt"></i> Move');
            doneBtn.html('<i class="fas fa-check"></i>').attr('title', 'Close').removeClass('howard-lgrid-cancel');
            html.find('.howard-lgrid-card').removeClass('selected');
            html.find('.howard-lgrid-dialog').removeClass('howard-lgrid-move-active');
          } else {
            // Activate move mode
            this._moveMode = true;
            this._pendingPositions = {};
            moveBtn.addClass('active').html('<i class="fas fa-lock"></i> Lock');
            doneBtn.html('<i class="fas fa-times"></i>').attr('title', 'Cancel move').addClass('howard-lgrid-cancel');
            html.find('.howard-lgrid-dialog').addClass('howard-lgrid-move-active');
            // If a card was already selected, setup drag immediately
            const selectedCard = html.find('.howard-lgrid-card.selected');
            if (selectedCard.length && selectedCard.data('layerId')) {
              this._moveLayerId = selectedCard.data('layerId');
              this._setupLayerDrag();
            }
          }
        });

        // --- Done / Cancel button ---
        html.find('.howard-lgrid-done-btn').click(() => {
          if (this._moveMode) {
            // Cancel — discard changes, don't save
            this._cleanupLayerDrag();
            this._moveMode = false;
            this._moveLayerId = null;
            this._pendingPositions = {};
          }
          dlg.close();
        });
      },
      close: () => {
        // Clean up move mode on any close (X button, escape, etc.)
        if (this._moveMode) {
          this._captureLayerPosition();
          this._cleanupLayerDrag();
          this._savePendingPositions();
          this._moveMode = false;
          this._moveLayerId = null;
        }
        this._activeTool = null;
      }
    }, {
      classes: ["dialog", "howard-dialog-window", "howard-layers-window"],
      width: 420
    });
    dlg.render(true);
  }

  _addImageLayer(slot, layerNum, imagePath) {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const layerId = `layer-${Date.now()}`;
    const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}`;
    this.actor.update({
      [`${basePath}.layers.${layerId}`]: {
        id: layerId,
        slot: slot,
        layerNum: layerNum,
        type: 'image',
        imagePath: imagePath,
        posX: 50,
        posY: 50
      }
    });
  }

  /* ------------------------------------------ */
  /*  Layer Move / Drag Repositioning            */
  /* ------------------------------------------ */

  _setupLayerDrag() {
    this._cleanupLayerDrag();
    if (!this._moveLayerId) return;

    const sheetEl = this.element;
    const imgEl = sheetEl.find(`img.howard-layer-image[data-layer-id="${this._moveLayerId}"]`)[0];
    if (!imgEl) return;

    imgEl.classList.add('howard-layer-moving');

    const onMouseDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      // Get panel dimensions
      const panel = imgEl.closest('.howard-panel');
      const panelRect = panel.getBoundingClientRect();

      // Parse current left/top percentages
      const startPosX = parseFloat(imgEl.style.left) || 50;
      const startPosY = parseFloat(imgEl.style.top) || 50;
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;

      imgEl.style.cursor = 'grabbing';

      const onMove = (e) => {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        // Convert pixel delta to percentage of panel dimensions
        const newX = Math.max(-50, Math.min(150, startPosX + (dx / panelRect.width) * 100));
        const newY = Math.max(-50, Math.min(150, startPosY + (dy / panelRect.height) * 100));
        imgEl.style.left = `${newX.toFixed(1)}%`;
        imgEl.style.top = `${newY.toFixed(1)}%`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        imgEl.style.cursor = '';

        // Store pending position
        this._pendingPositions[this._moveLayerId] = {
          posX: parseFloat(imgEl.style.left) || 50,
          posY: parseFloat(imgEl.style.top) || 50
        };
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    imgEl.addEventListener('mousedown', onMouseDown, { capture: true });
    this._moveCleanup = () => {
      imgEl.removeEventListener('mousedown', onMouseDown, { capture: true });
      imgEl.classList.remove('howard-layer-moving');
    };
  }

  _cleanupLayerDrag() {
    if (this._moveCleanup) {
      this._moveCleanup();
      this._moveCleanup = null;
    }
  }

  _captureLayerPosition() {
    if (!this._moveLayerId) return;
    const sheetEl = this.element;
    const imgEl = sheetEl.find(`img.howard-layer-image[data-layer-id="${this._moveLayerId}"]`)[0];
    if (!imgEl) return;

    this._pendingPositions[this._moveLayerId] = {
      posX: parseFloat(imgEl.style.left) || 50,
      posY: parseFloat(imgEl.style.top) || 50
    };
  }

  _savePendingPositions() {
    const entries = Object.entries(this._pendingPositions);
    if (entries.length === 0) return;

    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const updateData = {};
    const basePath = `system.tales.${this._activeTaleId}.pages.${currentPage.id}`;
    for (const [layerId, pos] of entries) {
      if (currentPage.layers?.[layerId]) {
        updateData[`${basePath}.layers.${layerId}.posX`] = Math.round(pos.posX * 10) / 10;
        updateData[`${basePath}.layers.${layerId}.posY`] = Math.round(pos.posY * 10) / 10;
      }
    }

    if (Object.keys(updateData).length > 0) {
      this.actor.update(updateData);
    }
    this._pendingPositions = {};
  }

  /* Removed: _showPageBackgroundDialog — old page background dialog (66 lines) */

  /* ------------------------------------------ */
  /*  Text Blocks                               */
  /* ------------------------------------------ */

  /* Removed: _showTextBlockDialog, _startTextBlockPlacement (363 lines) */

  _cancelTextBlockPlacement() {
    if (this._tbPlaceCleanup) {
      this._tbPlaceCleanup();
      this._tbPlaceCleanup = null;
    }
    this._tbPlacePending = null;
  }

  _cancelSkillMarkerPlacement() {
    if (this._smPlaceCleanup) {
      this._smPlaceCleanup();
      this._smPlaceCleanup = null;
    }
    this._smPlacePending = null;
  }

  /* Removed: _addTextBlock, _updateTextBlock, text block drag helpers (175 lines) */


  /* ------------------------------------------ */
  /*  Skill Check Markers                       */
  /* ------------------------------------------ */

  /* Removed: _showSkillMarkerDialog, _showGmNotesReadOnly, _showGmNotesDialog, skill marker helpers (1061 lines) */

  static async _loadEnemyLookup() {
    if (HowardSheet._enemyLookup) return HowardSheet._enemyLookup;
    try {
      const enemyDataPath = game.settings?.get('howard-chronicler', 'enemyDataPath') ?? null;
      if (!enemyDataPath) { HowardSheet._enemyLookup = {}; return {}; }
      const resp = await fetch(enemyDataPath);
      const data = await resp.json();

      // Integrate custom enemies from settings (same as tools-sheet _integrateCustomEnemies)
      const customEnemies = ((() => { try { return game.settings.get('conan', 'customEnemies'); } catch(e) { return []; } })()) || [];
      for (const enemy of customEnemies) {
        const catKey = enemy.category || 'unknown';
        if (!data.categories[catKey]) {
          data.categories[catKey] = { name: catKey, icon: 'fa-question', description: '', groups: {} };
        }
        const cat = data.categories[catKey];
        const grpKeys = Object.keys(cat.groups || {});
        let targetGrp = grpKeys[0] || 'default';
        if (!cat.groups[targetGrp]) cat.groups[targetGrp] = { name: cat.name, enemies: [] };
        if (!cat.groups[targetGrp].enemies) cat.groups[targetGrp].enemies = [];
        cat.groups[targetGrp].enemies.push({ ...enemy, isCustom: true });
      }

      // Apply custom images from settings (same as tools-sheet _applyCustomEnemyImages)
      const customImages = ((() => { try { return game.settings.get('conan', 'enemyCustomImages'); } catch(e) { return {}; } })()) || {};
      for (const [catKey, cat] of Object.entries(data.categories || {})) {
        for (const [grpKey, grp] of Object.entries(cat.groups || {})) {
          for (const enemy of grp.enemies || []) {
            const key = `${catKey}.${grpKey}.${enemy.id}`;
            if (customImages[key]) {
              if (customImages[key].portraitImg) enemy.portraitImg = customImages[key].portraitImg;
              if (customImages[key].tokenImg) enemy.tokenImg = customImages[key].tokenImg;
            }
          }
        }
      }

      const lookup = {};
      for (const [catKey, cat] of Object.entries(data.categories || {})) {
        for (const [grpKey, grp] of Object.entries(cat.groups || {})) {
          for (const enemy of grp.enemies || []) {
            lookup[enemy.name.toLowerCase()] = {
              name: enemy.name,
              category: catKey,
              group: grpKey,
              enemyId: enemy.id
            };
          }
        }
      }
      HowardSheet._enemyLookup = lookup;
      HowardSheet._enemyCategories = data.categories;
      return lookup;
    } catch (e) {
      console.warn('Howard: Failed to load enemy lookup', e);
      return {};
    }
  }

  static _openAlbertToEnemy(category, group) {
    // Try to open a compatible enemy browser (Conan GM Tools or similar)
    const toolsActor = game.actors.find(a => a.type === 'tools');
    if (!toolsActor) return ui.notifications.info("No enemy browser available.");
    const sheet = toolsActor.sheet;
    if (sheet._activeTab !== undefined) sheet._activeTab = 'enemies';
    if (sheet._enemyCategoryExpanded) sheet._enemyCategoryExpanded.add(`enemy-${category}`);
    sheet.render(true);
    setTimeout(() => {
      const groupEl = sheet.element?.find(`.enemy-group[data-category="${category}"][data-group="${group}"]`);
      if (groupEl?.length) groupEl[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }

  /* ------------------------------------------ */
  /*  Page Management                           */
  /* ------------------------------------------ */

  _createDefaultPanels(template) {
    const slotCount = PAGE_TEMPLATES[template]?.slots || 1;
    const panels = {};
    for (let i = 0; i < slotCount; i++) {
      const panelId = `panel-${i}`;
      panels[panelId] = {
        id: panelId,
        type: 'narration',
        content: '',
        slot: i
      };
    }
    return panels;
  }

  _onAddPage() {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale) return;

    const pageCount = Object.keys(tale.pages || {}).length;
    if (pageCount >= 32) {
      ui.notifications.warn("Maximum 32 pages per tale.");
      return;
    }

    // New system: blank page, no template picker
    const pageId = `page-${Date.now()}`;
    const newPage = {
      id: pageId,
      pageNumber: pageCount,
      panels: {},
      images: {},
      textBlocks: {},
      speechBubbles: {},
      enemies: [],
      checks: {},
      hiddenElements: {},
      gmNotes: { title: '', notes: '' }
    };

    this._readerPageIndex = pageCount;
    this.actor.update({
      [`system.tales.${this._activeTaleId}.pages.${pageId}`]: newPage
    });
  }

  async _onDeletePage() {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;

    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    if (pages.length <= 1) {
      ui.notifications.warn("Cannot delete the last page.");
      return;
    }

    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const templateLabel = PAGE_TEMPLATES[currentPage.template]?.label || currentPage.template;

    const confirmed = await Dialog.confirm({
      title: "Delete Page",
      content: `<p style="color:var(--s2-text); font-family:var(--s2-font);">
        Delete ${this._getPageLabel()} (${templateLabel})? This cannot be undone.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    if (!confirmed) return;

    const updateData = {
      [`system.tales.${this._activeTaleId}.pages.-=${currentPage.id}`]: null
    };

    // Renumber remaining pages
    const remaining = pages.filter(p => p.id !== currentPage.id);
    remaining.forEach((page, idx) => {
      if (page.pageNumber !== idx) {
        updateData[`system.tales.${this._activeTaleId}.pages.${page.id}.pageNumber`] = idx;
      }
    });

    if (this._readerPageIndex >= remaining.length) {
      this._readerPageIndex = Math.max(0, remaining.length - 1);
    }

    await this.actor.update(updateData);
  }

  /* Removed: _onChangeTemplate (31 lines) */


  _showTemplatePickerDialog(callback) {
    let gridHtml = '<div class="howard-template-grid">';
    for (const [key, tmpl] of Object.entries(PAGE_TEMPLATES)) {
      gridHtml += `
        <div class="howard-template-option" data-template="${key}">
          <div class="howard-template-thumb">
            <i class="fas ${tmpl.icon}"></i>
          </div>
          <div class="howard-template-label">${tmpl.label}</div>
          <div class="howard-template-desc">${tmpl.description}</div>
        </div>
      `;
    }
    gridHtml += '</div>';

    const content = `<div class="howard-dialog">${gridHtml}</div>`;
    let selectedTemplate = null;

    new Dialog({
      title: "Choose Page Template",
      content,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Add Page",
          callback: () => {
            if (selectedTemplate) callback(selectedTemplate);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "confirm",
      render: (html) => {
        html.find('.howard-template-option').click(function() {
          html.find('.howard-template-option').removeClass('selected');
          $(this).addClass('selected');
          selectedTemplate = this.dataset.template;
        });
        // Pre-select standard
        html.find('.howard-template-option[data-template="standard"]').click();
      }
    }, {
      classes: ["dialog", "howard-dialog-window"],
      width: 500
    }).render(true);
  }

  /* ------------------------------------------ */
  /*  Panel Editing                             */
  /* ------------------------------------------ */

  _onEditPanel(panelId) {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;

    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const panel = currentPage.panels[panelId];
    if (!panel) return;

    const typeOptions = Object.entries(PANEL_TYPES).map(([key, t]) =>
      `<option value="${key}" ${panel.type === key ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    const content = `
      <div class="howard-dialog howard-panel-editor">
        <div class="howard-form-group">
          <label>Panel Type</label>
          <select name="panelType" class="howard-panel-type-select">
            ${typeOptions}
          </select>
        </div>
        <div class="howard-panel-fields" data-type="${panel.type}">
          ${this._buildPanelFieldsHTML(panel)}
        </div>
      </div>
    `;

    new Dialog({
      title: `Edit Panel (Slot ${panel.slot + 1})`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: (html) => {
            this._savePanelFromDialog(html, currentPage.id, panelId, panel.slot);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "save",
      render: (html) => {
        // When type changes, rebuild the fields section
        html.find('.howard-panel-type-select').change((ev) => {
          const newType = ev.target.value;
          const fakePanel = { ...panel, type: newType, content: '', characterName: '', skillName: '', dc: '', successText: '', failText: '', imagePath: '' };
          html.find('.howard-panel-fields')
            .attr('data-type', newType)
            .html(this._buildPanelFieldsHTML(fakePanel));

          if (newType === 'image') {
            this._attachPanelImagePicker(html);
          }
        });

        if (panel.type === 'image') {
          this._attachPanelImagePicker(html);
        }
      }
    }, {
      classes: ["dialog", "howard-dialog-window"],
      width: 450
    }).render(true);
  }

  _buildPanelFieldsHTML(panel) {
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    switch (panel.type) {
      case 'narration':
        return `
          <div class="howard-form-group">
            <label>Narration Text</label>
            <textarea name="content" rows="6" placeholder="The wind howled across the desolate plains...">${esc(panel.content)}</textarea>
          </div>`;

      case 'dialogue':
        return `
          <div class="howard-form-group">
            <label>Character Name</label>
            <input type="text" name="characterName" value="${esc(panel.characterName)}" placeholder="Conan" />
          </div>
          <div class="howard-form-group">
            <label>Dialogue Text</label>
            <textarea name="content" rows="4" placeholder="By Crom!">${esc(panel.content)}</textarea>
          </div>`;

      case 'read-aloud':
        return `
          <div class="howard-form-group">
            <label>Read-Aloud Text</label>
            <textarea name="content" rows="6" placeholder="You enter a dimly lit chamber...">${esc(panel.content)}</textarea>
          </div>`;

      case 'gm-note':
        return `
          <div class="howard-form-group">
            <label>GM Note <span style="color:var(--s2-accent); font-size:9px;">(hidden from players)</span></label>
            <textarea name="content" rows="6" placeholder="The trap triggers when...">${esc(panel.content)}</textarea>
          </div>`;

      case 'skill-check':
        return `
          <div class="howard-form-group">
            <label>Skill Name</label>
            <input type="text" name="skillName" value="${esc(panel.skillName)}" placeholder="Athletics" />
          </div>
          <div class="howard-form-group">
            <label>Difficulty (DC)</label>
            <input type="number" name="dc" value="${panel.dc || ''}" min="1" placeholder="2" />
          </div>
          <div class="howard-form-group">
            <label>Success Text</label>
            <textarea name="successText" rows="3" placeholder="You leap across the chasm...">${esc(panel.successText)}</textarea>
          </div>
          <div class="howard-form-group">
            <label>Failure Text</label>
            <textarea name="failText" rows="3" placeholder="You fall short and tumble...">${esc(panel.failText)}</textarea>
          </div>`;

      case 'image':
        return `
          <div class="howard-form-group">
            <label>Image</label>
            <div class="howard-panel-image-preview" data-action="pick-panel-image">
              ${panel.imagePath
                ? `<img src="${panel.imagePath}">`
                : '<span class="placeholder-icon"><i class="fas fa-image"></i></span>'}
            </div>
            <input type="hidden" name="imagePath" value="${esc(panel.imagePath)}" />
          </div>
          <div class="howard-form-group">
            <label>Caption (optional)</label>
            <input type="text" name="content" value="${esc(panel.content)}" placeholder="The tower loomed overhead..." />
          </div>`;

      default:
        return `
          <div class="howard-form-group">
            <label>Content</label>
            <textarea name="content" rows="6">${esc(panel.content)}</textarea>
          </div>`;
    }
  }

  _attachPanelImagePicker(html) {
    html.find('.howard-panel-image-preview').off('click').on('click', () => {
      new FilePicker({
        type: "image",
        current: html.find('input[name="imagePath"]').val() || "",
        callback: (path) => {
          html.find('input[name="imagePath"]').val(path);
          html.find('.howard-panel-image-preview').html(`<img src="${path}">`);
        }
      }).render(true);
    });
  }

  _savePanelFromDialog(html, pageId, panelId, slot) {
    const type = html.find('select[name="panelType"]').val() || 'narration';
    const basePath = `system.tales.${this._activeTaleId}.pages.${pageId}.panels.${panelId}`;

    const updateData = {
      [`${basePath}.type`]: type,
      [`${basePath}.content`]: html.find('[name="content"]').val() || '',
      [`${basePath}.slot`]: slot
    };

    if (type === 'dialogue') {
      updateData[`${basePath}.characterName`] = html.find('[name="characterName"]').val() || '';
    }
    if (type === 'skill-check') {
      updateData[`${basePath}.skillName`] = html.find('[name="skillName"]').val() || '';
      updateData[`${basePath}.dc`] = parseInt(html.find('[name="dc"]').val()) || 1;
      updateData[`${basePath}.successText`] = html.find('[name="successText"]').val() || '';
      updateData[`${basePath}.failText`] = html.find('[name="failText"]').val() || '';
    }
    if (type === 'image') {
      updateData[`${basePath}.imagePath`] = html.find('[name="imagePath"]').val() || '';
    }

    this.actor.update(updateData);
  }

  /* ------------------------------------------ */
  /*  Add Tale Dialog                           */
  /* ------------------------------------------ */

  _onAddTale() {
    const talesObj = this.actor.system.tales || {};
    const existingTales = Object.values(talesObj);
    const maxIssue = existingTales.reduce((max, t) => Math.max(max, t.issueNumber || 0), 0);
    const nextIssue = maxIssue + 1;

    const content = `
      <div class="howard-dialog">
        <div class="howard-form-group">
          <label>Issue Number</label>
          <input type="number" name="issueNumber" value="${nextIssue}" min="1" />
        </div>
        <div class="howard-form-group">
          <label>Title</label>
          <input type="text" name="title" placeholder="The Tower of the Elephant" />
        </div>
        <div class="howard-form-group">
          <label>Cover Image</label>
          <div class="howard-cover-preview" data-action="pick-cover">
            <span class="placeholder-icon"><i class="fas fa-image"></i></span>
          </div>
          <input type="hidden" name="coverImage" value="" />
        </div>
      </div>
    `;

    new Dialog({
      title: "Forge New Tale",
      content,
      buttons: {
        forge: {
          icon: '<i class="fas fa-hammer"></i>',
          label: "Forge",
          callback: (html) => {
            const issueNumber = parseInt(html.find('input[name="issueNumber"]').val()) || nextIssue;
            const title = html.find('input[name="title"]').val() || "Untitled Tale";
            const coverImage = html.find('input[name="coverImage"]').val() || "";
            const id = `tale-${Date.now()}`;

            // Create tale with one blank page (no splash template — avoids image visibility bug)
            const firstPageId = `page-${Date.now()}`;
            const pages = {
              [firstPageId]: {
                id: firstPageId,
                pageNumber: 0,
                panels: {},
                images: {},
                textBlocks: {},
                speechBubbles: {},
                enemies: [],
                checks: {},
                hiddenElements: {},
                gmNotes: { title: '', notes: '' }
              }
            };

            this.actor.update({
              [`system.tales.${id}`]: { id, title, issueNumber, coverImage, pages, currentPage: 0 }
            });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "forge",
      render: (html) => {
        html.find('.howard-cover-preview').click(() => {
          new FilePicker({
            type: "image",
            current: html.find('input[name="coverImage"]').val() || "modules/howard-chronicler/images/Tales/",
            callback: (path) => {
              html.find('input[name="coverImage"]').val(path);
              html.find('.howard-cover-preview').html(`<img src="${path}">`);
            }
          }).render(true);
        });
      }
    }, {
      classes: ["dialog", "howard-dialog-window"],
      width: 350
    }).render(true);
  }

  /* ------------------------------------------ */
  /*  Delete Tale Dialog                        */
  /* ------------------------------------------ */

  _onDeleteTale() {
    const talesObj = this.actor.system.tales || {};
    const talesList = Object.values(talesObj)
      .sort((a, b) => a.issueNumber - b.issueNumber);

    if (talesList.length === 0) return;

    const options = talesList.map(t =>
      `<option value="${t.id}">Issue #${t.issueNumber} — ${t.title}</option>`
    ).join('');

    const content = `
      <div class="howard-dialog">
        <div class="howard-form-group">
          <label>Select Tale to Delete</label>
          <select name="taleId" style="width:100%; padding:8px 12px; background:var(--s2-bg0); border:2px solid var(--s2-stroke-strong); border-radius:var(--s2-radius-small); color:var(--s2-text); font-family:var(--s2-font); font-size:13px;">
            ${options}
          </select>
        </div>
        <p style="color:var(--s2-muted); font-size:12px; margin-top:8px;">You can undo this immediately after.</p>
      </div>
    `;

    new Dialog({
      title: "Delete Tale",
      content,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete",
          callback: (html) => {
            const taleId = html.find('select[name="taleId"]').val();
            if (!taleId) return;

            const tale = this.actor.system.tales[taleId];
            // Stash for undo (deep copy)
            this._deletedTale = { id: taleId, data: foundry.utils.deepClone(tale) };

            this.actor.update({
              [`system.tales.-=${taleId}`]: null
            });

            if (this._currentIndex > 0) this._currentIndex--;

            ui.notifications.info(`Deleted "${tale?.title}" — click Undo to restore.`);
            this.render(false);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "cancel"
    }, {
      classes: ["dialog", "howard-dialog-window"],
      width: 350
    }).render(true);
  }

  _onUndoDeleteTale() {
    if (!this._deletedTale) return;
    const { id, data } = this._deletedTale;
    this.actor.update({ [`system.tales.${id}`]: data });
    ui.notifications.info(`Restored "${data.title}".`);
    this._deletedTale = null;
    this.render(false);
  }

  /* ------------------------------------------ */
  /*  Export                                     */
  /* ------------------------------------------ */

  /** Show export options dialog, then build print document */
  _onExportPDF() {
    const talesObj = this.actor.system.tales || {};
    const talesList = Object.values(talesObj).sort((a, b) => a.issueNumber - b.issueNumber);
    if (!talesList.length) return ui.notifications.warn('No tales to export.');

    const idx = Math.max(0, Math.min(this._currentIndex, talesList.length - 1));
    const tale = talesList[idx];
    const pages = Object.values(tale.pages || {}).sort((a, b) => a.pageNumber - b.pageNumber);

    new Dialog({
      title: 'Export Tale as PDF',
      content: `
        <form style="padding:8px 0;">
          <p style="margin:0 0 8px;"><strong>${tale.title}</strong> — Issue #${tale.issueNumber}</p>
          <p style="margin:0 0 12px; color:#aaa;">${pages.length} page${pages.length !== 1 ? 's' : ''} + cover</p>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" id="howard-export-gm" />
            <label for="howard-export-gm">Include GM Notes (landscape spread)</label>
          </div>
        </form>`,
      buttons: {
        export: {
          icon: '<i class="fas fa-file-pdf"></i>',
          label: 'Export',
          callback: (html) => {
            const includeGm = html.find('#howard-export-gm')[0]?.checked ?? false;
            this._buildPrintDocument(tale, pages, includeGm);
          }
        },
        cancel: { label: 'Cancel' }
      },
      default: 'export'
    }).render(true);
  }

  /** Build a self-contained HTML document for print-to-PDF */
  async _buildPrintDocument(tale, pages, includeGmNotes) {
    const origin = window.location.origin;
    const resolve = (path) => path ? new URL(path, origin).href : '';

    const pw = 520, ph = 780;
    const pageW = includeGmNotes ? 1100 : pw;

    let pagesHtml = '';

    // Cover page
    const coverImg = resolve(tale.coverImage || 'modules/howard-chronicler/images/howard.png');
    pagesHtml += `<div class="print-page">
      <div class="comic-page">
        <img class="page-bg" src="${coverImg}" />
        <div class="cover-overlay">
          <span class="cover-issue">Issue #${tale.issueNumber}</span>
          <h2 class="cover-title">${this._escHtml(tale.title)}</h2>
        </div>
      </div>
      ${includeGmNotes ? '<div class="notes-panel"><p class="notes-label">Cover</p></div>' : ''}
    </div>`;

    // Content pages
    for (const page of pages) {
      let comicHtml = '';

      if (page.background) {
        comicHtml += `<img class="page-bg" src="${resolve(page.background)}" />`;
      }

      const pageImages = Object.values(page.images || {}).sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1));
      for (const img of pageImages) {
        comicHtml += `<img class="page-layer" src="${resolve(img.imagePath)}" style="z-index:${img.layerNum || 1}; left:${img.posX ?? 0}%; top:${img.posY ?? 0}%" />`;
      }

      const panels = Object.values(page.panels || {}).map(p => ({
        ...p, x: p.x ?? 0, y: p.y ?? 0, width: p.width ?? 100, height: p.height ?? 100,
        zIndex: p.zIndex ?? 10, transparent: !!p.transparent
      })).sort((a, b) => a.zIndex - b.zIndex);

      for (const p of panels) {
        const cls = p.transparent ? 'panel panel-transparent' : 'panel';
        let layersHtml = '';
        const layers = p.layers ? Object.values(p.layers).sort((a, b) => (a.layerNum || 1) - (b.layerNum || 1)) : [];
        for (const l of layers) {
          layersHtml += `<img class="layer-img" src="${resolve(l.imagePath)}" style="z-index:${l.layerNum || 1}; left:${l.posX ?? 50}%; top:${l.posY ?? 50}%; width:${l.zoom ?? 100}%" />`;
        }
        const contentHtml = p.content?.trim() ? `<div class="panel-inner"><div class="panel-content">${this._escHtml(p.content)}</div></div>` : '';
        comicHtml += `<div class="${cls}" style="left:${p.x}%; top:${p.y}%; width:${p.width}%; height:${p.height}%; z-index:${p.zIndex};">${layersHtml}${contentHtml}</div>`;
      }

      const tbs = Object.values(page.textBlocks || {}).map(tb => ({
        ...tb, x: tb.x ?? tb.posX ?? 0, y: tb.y ?? tb.posY ?? 0,
        width: tb.width ?? tb.fixedWidth ?? 30, height: tb.height ?? 15,
        zIndex: tb.zIndex ?? tb.layerNum ?? 10, style: tb.style || 'caption'
      })).sort((a, b) => a.zIndex - b.zIndex);

      for (const tb of tbs) {
        comicHtml += `<div class="text-block" style="left:${tb.x}%; top:${tb.y}%; width:${tb.width}%; height:${tb.height}%; z-index:${tb.zIndex};"><div class="text-content tb-style-${tb.style}">${this._escHtml(tb.content || '')}</div></div>`;
      }

      const sbs = Object.values(page.speechBubbles || {}).map(sb => ({
        ...sb, x: sb.x ?? sb.posX ?? 0, y: sb.y ?? sb.posY ?? 0,
        width: sb.width ?? 25, height: sb.height ?? 10, zIndex: sb.zIndex ?? 15
      })).sort((a, b) => a.zIndex - b.zIndex);

      let tailPolygons = '';
      for (const sb of sbs) {
        const pts = this._computeTailGeometry(sb);
        if (pts) tailPolygons += `<polygon points="${pts}" fill="#fff" stroke="#333" stroke-width="0.4" />`;
      }
      if (tailPolygons) {
        comicHtml += `<svg class="tail-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${tailPolygons}</svg>`;
      }

      for (const sb of sbs) {
        comicHtml += `<div class="speech-bubble" style="left:${sb.x}%; top:${sb.y}%; width:${sb.width}%; height:${sb.height}%; z-index:${sb.zIndex};"><div class="speech-content">${this._escHtml(sb.content || '')}</div></div>`;
      }

      let notesHtml = '';
      if (includeGmNotes) {
        const gn = page.gmNotes || {};
        const enemies = page.enemies || [];
        let notesContent = '';
        if (gn.title) notesContent += `<h3 class="notes-title">${this._escHtml(gn.title)}</h3>`;
        if (enemies.length) {
          notesContent += `<div class="notes-section"><strong>Actors:</strong><ul>${enemies.map(e => `<li>${this._escHtml(typeof e === 'string' ? e : e.name || 'Actor')}</li>`).join('')}</ul></div>`;
        }
        const checksObj = page.checks || {};
        const checks = Array.isArray(checksObj) ? checksObj : Object.values(checksObj);
        if (checks.length) {
          notesContent += `<div class="notes-section"><strong>Skill Checks:</strong><ul>${checks.map(c => `<li>${this._escHtml(c.skillName || 'Skill')} DC ${c.dc || '?'}${c.prompt ? ' — ' + this._escHtml(c.prompt) : ''}</li>`).join('')}</ul></div>`;
        }
        if (gn.notes) notesContent += `<div class="notes-section"><strong>Notes:</strong><div class="notes-text">${gn.notes}</div></div>`;
        if (!notesContent) notesContent = '<p class="notes-label">No notes for this page.</p>';
        notesHtml = `<div class="notes-panel">${notesContent}</div>`;
      }

      pagesHtml += `<div class="print-page">
        <div class="comic-page">${comicHtml}</div>
        ${notesHtml}
      </div>`;
    }

    const doc = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<title>${this._escHtml(tale.title)} — Export</title>
<link rel="stylesheet" href="${origin}/fonts/fontawesome/css/all.min.css" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; background: #222; color: #eee; }
  .toolbar { position: sticky; top: 0; z-index: 9999; background: #1a1a2e; padding: 10px 20px; display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #444; }
  .toolbar h2 { font-size: 16px; flex: 1; }
  .toolbar button { padding: 8px 20px; font-size: 14px; font-weight: 600; border: 2px solid #3182ce; background: #3182ce; color: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button:hover { background: #2b6cb0; }
  .print-page { display: flex; align-items: flex-start; gap: 0; width: ${pageW}px; height: ${ph}px; margin: 20px auto; background: #111; page-break-after: always; break-after: page; }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .comic-page { position: relative; width: ${pw}px; height: ${ph}px; flex-shrink: 0; overflow: hidden; background: #1a1a2e; }
  .page-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .page-layer { position: absolute; width: 100%; height: 100%; object-fit: cover; border: 0; }
  .panel { position: absolute; background: #1a1a2e; border: 2px solid #4a5568; border-radius: 3px; overflow: hidden; }
  .panel-transparent { background: transparent; border: none; border-radius: 0; }
  .layer-img { position: absolute; height: auto; max-width: none; max-height: none; transform: translate(-50%, -50%); border: 0; }
  .panel-inner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px; }
  .panel-content { color: #fff; font-size: 14px; text-align: center; }
  .text-block { position: absolute; overflow: hidden; padding: 2px; }
  .text-content { width: 100%; height: 100%; overflow: hidden; font-size: 16px; font-weight: 500; line-height: 1.4; color: #f0e6d2; background: rgba(0,0,0,0.75); padding: 6px 10px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.1); }
  .tb-style-speech { background: #fff; color: #1a1a1a; font-weight: 400; border-radius: 14px; border: 2px solid #333; }
  .tail-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 14; pointer-events: none; }
  .speech-bubble { position: absolute; overflow: visible; border-radius: 14px; border: 2px solid #333; background: #fff; padding: 8px 14px; }
  .speech-content { width: 100%; height: 100%; overflow: hidden; color: #000; font-size: 16px; font-weight: 600; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap; }
  .cover-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 16px 16px; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%); }
  .cover-issue { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c8a84e; margin-bottom: 4px; }
  .cover-title { font-size: 22px; font-weight: bold; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.8); line-height: 1.2; }
  .notes-panel { width: ${pageW - pw}px; height: ${ph}px; flex-shrink: 0; overflow: auto; padding: 20px 24px; background: #1a1a2e; border-left: 2px solid #4a5568; color: #ddd; font-size: 13px; line-height: 1.6; }
  .notes-label { color: #888; font-style: italic; }
  .notes-title { font-size: 16px; color: #c8a84e; margin-bottom: 8px; }
  .notes-section { margin-bottom: 12px; }
  .notes-section ul { margin: 4px 0 0 20px; }
  .notes-section li { margin-bottom: 2px; }
  .notes-text { margin-top: 4px; white-space: pre-wrap; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; margin: 0; padding: 0; }
    @page { size: ${pageW}px ${ph}px; margin: 0; }
    .print-page { margin: 0; box-shadow: none; }
    * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head><body>
<div class="toolbar">
  <h2>${this._escHtml(tale.title)} — Issue #${tale.issueNumber}</h2>
  <button onclick="window.print()"><i class="fas fa-print"></i> Print / Save PDF</button>
</div>
${pagesHtml}
</body></html>`;

    const safeName = tale.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeName}_Issue${tale.issueNumber}${includeGmNotes ? '_GM' : ''}.html`;
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info(`Downloading ${fileName} — open in browser, then Print / Save as PDF.`);
  }

  /** Escape HTML entities */
  _escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ------------------------------------------ */
  /*  Show to Players                           */
  /* ------------------------------------------ */

  /** Open — navigate all players to the current tale/page via ChatMessage broadcast */
  async _openForPlayers() {
    if (!this._activeTaleId) return;

    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale) return;

    // First Open per tale per session → send players to the cover page (-1)
    // Subsequent Opens → send players to the GM's current page
    const taleId = this._activeTaleId;
    const firstOpen = !HowardSheet._coverShownTales[taleId];
    const pageIndex = firstOpen ? -1 : this._readerPageIndex;
    HowardSheet._coverShownTales[taleId] = true;

    // Broadcast via invisible ChatMessage (same pattern as flex celebrations)
    const msg = await ChatMessage.create({
      content: '',
      whisper: [],
      blind: true,
      flags: {
        "howard-chronicler": {
          howardShow: true,
          taleId: taleId,
          pageIndex: pageIndex
        }
      }
    });
    if (msg) msg.delete();

    const label = firstOpen ? 'Cover' : this._getPageLabel();
    ui.notifications.info(`Opened ${label} of "${tale.title}" for players.`);
  }

  /** Toggle Show/Hide — cycles: off → show → hide → show → ... Click again same = swap */
  _toggleShowHide() {
    if (!this._showMode) {
      // Off → activate Show
      this._showMode = 'show';
    } else if (this._showMode === 'show') {
      // Show → swap to Hide
      this._showMode = 'hide';
    } else {
      // Hide → swap to Show
      this._showMode = 'show';
    }
    // Exit edit mode if active
    if (this._editMode) {
      this._editMode = false;
      this._selectedPanelId = null;
      this._unlockedPanelId = null;
      this._activeTool = null;
    }
    this.render(false);
  }

  /** Click a panel in show/hide mode — one-directional reveal or hide */
  async _togglePanelReveal(slot) {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const revealedObj = tale.revealedPanels?.[currentPage.id] || {};
    const isCurrentlyRevealed = !!revealedObj[String(slot)];
    const basePath = `system.tales.${this._activeTaleId}.revealedPanels.${currentPage.id}`;
    let action = null;

    // Show mode: only reveal (skip if already revealed)
    if (this._showMode === 'show' && !isCurrentlyRevealed) {
      action = 'reveal';
      // Optimistic GM DOM update
      const el = this.element.find(`.howard-panel[data-slot="${slot}"]`);
      if (el.length) el.addClass('howard-panel-revealed');
      this.actor.update({ [`${basePath}.${slot}`]: true }, { render: false });
    }
    // Hide mode: only un-reveal (skip if already hidden)
    else if (this._showMode === 'hide' && isCurrentlyRevealed) {
      action = 'hide';
      const el = this.element.find(`.howard-panel[data-slot="${slot}"]`);
      if (el.length) el.removeClass('howard-panel-revealed');
      this.actor.update({ [`${basePath}.-=${slot}`]: null }, { render: false });
    }

    // Broadcast to players for real-time DOM update on their side
    if (action) {
      const msg = await ChatMessage.create({
        content: '', whisper: [], blind: true,
        flags: { "howard-chronicler": { howardReveal: true, action, key: String(slot), pageId: currentPage.id } }
      });
      if (msg) msg.delete();
    }
  }

  /** Click a text block in show/hide mode — one-directional reveal or hide */
  async _revealTextBlock(tbId) {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const revealedObj = tale.revealedPanels?.[currentPage.id] || {};
    const isCurrentlyRevealed = !!revealedObj[tbId];
    const basePath = `system.tales.${this._activeTaleId}.revealedPanels.${currentPage.id}`;
    let action = null;

    if (this._showMode === 'show' && !isCurrentlyRevealed) {
      action = 'reveal';
      const el = this.element.find(`.howard-text-block[data-tb-id="${tbId}"]`);
      if (el.length) el.addClass('howard-tb-revealed').removeClass('howard-tb-unrevealed');
      this.actor.update({ [`${basePath}.${tbId}`]: true }, { render: false });
    } else if (this._showMode === 'hide' && isCurrentlyRevealed) {
      action = 'hide';
      const el = this.element.find(`.howard-text-block[data-tb-id="${tbId}"]`);
      if (el.length) el.removeClass('howard-tb-revealed').addClass('howard-tb-unrevealed');
      this.actor.update({ [`${basePath}.-=${tbId}`]: null }, { render: false });
    }

    if (action) {
      const msg = await ChatMessage.create({
        content: '', whisper: [], blind: true,
        flags: { "howard-chronicler": { howardReveal: true, action, key: tbId, pageId: currentPage.id } }
      });
      if (msg) msg.delete();
    }
  }

  /** Hide — clear all revealed panels on the current page */
  _hideAllPanels() {
    if (!this._activeTaleId) return;
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    this.actor.update({
      [`system.tales.${this._activeTaleId}.revealedPanels.-=${currentPage.id}`]: null
    });
  }

  /* ------------------------------------------ */
  /*  Forge Hide/Show Targeting Tool             */
  /* ------------------------------------------ */

  /** Toggle a page's hidden state + update DOM in page strip (no re-render) */
  async _togglePageHidden(pageId, shouldHide) {
    if (!this._activeTaleId) return;
    const talePath = `system.tales.${this._activeTaleId}`;

    if (shouldHide) {
      await this.actor.update({ [`${talePath}.hiddenPages.${pageId}`]: true }, { render: false });
    } else {
      await this.actor.update({ [`${talePath}.hiddenPages.-=${pageId}`]: null }, { render: false });
    }

    // DOM update: toggle visual state on the page strip button
    const btn = this.element.find(`.howard-page-strip-item[data-page-id="${pageId}"]`);
    if (shouldHide) {
      btn.addClass('howard-page-hidden');
    } else {
      btn.removeClass('howard-page-hidden');
    }

    // Broadcast to players so their view re-renders with updated page visibility
    const msg = await ChatMessage.create({
      content: '', whisper: [], blind: true,
      flags: { "howard-chronicler": { howardPageVisibility: true, taleId: this._activeTaleId } }
    });
    if (msg) msg.delete();
  }

  /* ------------------------------------------ */
  /*  Presentation Mode                          */
  /* ------------------------------------------ */

  /** Zoom into a single element — clone it and broadcast to players */
  async _presZoomElement(el) {
    const elId = String(el.data('panelId') || el.data('tbId') || el.data('sbId') || '');
    if (!elId) return;

    // Broadcast zoom with element ID to players
    const msg = await ChatMessage.create({
      content: '', whisper: [], blind: true,
      flags: {
        "howard-chronicler": {
          howardPresZoom: true,
          taleId: this._activeTaleId,
          pageIndex: this._readerPageIndex,
          elId: elId
        }
      }
    });
    if (msg) msg.delete();

    // Also show zoom overlay on GM side
    HowardSheet._showZoomOverlay(this, elId);
  }

  /** Roll Call — ad-hoc skill check from Presentation mode */
  _onRollCall() {
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const content = `
      <div class="rollcall-dialog-body">
        <div class="rollcall-section-label">Check Type</div>
        <div class="rollcall-radio-group">
          <label class="rollcall-radio"><input type="radio" name="skillName" value="Might" checked /> Might</label>
          <label class="rollcall-radio"><input type="radio" name="skillName" value="Edge" /> Edge</label>
          <label class="rollcall-radio"><input type="radio" name="skillName" value="Grit" /> Grit</label>
          <label class="rollcall-radio"><input type="radio" name="skillName" value="Wits" /> Wits</label>
          <label class="rollcall-radio"><input type="radio" name="skillName" value="Custom" /> <input type="text" class="rollcall-custom-name" placeholder="Custom..." style="width:100px;" /></label>
        </div>
        <div class="rollcall-row">
          <label class="rollcall-label">TN#</label>
          <input type="number" class="rollcall-tn" value="5" min="1" max="99" />
        </div>
        <div class="rollcall-row" style="flex-direction:column; align-items:stretch;">
          <label class="rollcall-label">Success Text <span style="color:#666;font-weight:400;">(hidden until reveal)</span></label>
          <textarea class="rollcall-success-text" rows="3" placeholder="Revealed on success..."></textarea>
        </div>
      </div>`;

    new Dialog({
      title: 'Roll Call',
      content,
      buttons: {
        send: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: 'Send',
          callback: (html) => {
            let skillName = html.find('input[name="skillName"]:checked').val();
            if (skillName === 'Custom') {
              skillName = html.find('.rollcall-custom-name').val().trim() || 'Skill';
            }
            const dc = parseInt(html.find('.rollcall-tn').val()) || 5;
            const prompt = html.find('.rollcall-success-text').val().trim();

            const check = { skillName, dc, prompt };
            this._fireRollCall(check);
          }
        },
        cancel: { label: 'Cancel' }
      },
      default: 'send',
      render: (html) => {
        // Clicking custom text input auto-selects its radio
        html.find('.rollcall-custom-name').on('focus', () => {
          html.find('input[name="skillName"][value="Custom"]').prop('checked', true);
        });
      }
    }, {
      width: 320,
      classes: ['bpm-dialog-window', 'rollcall-dialog']
    }).render(true);
  }

  /** Fire an ad-hoc roll call check — chat card + GM dialog */
  async _fireRollCall(check) {
    const howardImg = 'modules/howard-chronicler/images/howard.png';
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const content = `
      <div class="conan-roll spell-chat-card howard-check-card">
        <div class="spell-chat-header">
          <div class="spell-chat-portrait-wrap">
            <img src="${howardImg}" class="spell-chat-portrait"/>
            <div class="howard-check-badge"><i class="fas fa-dice-d20"></i></div>
          </div>
          <div class="spell-chat-title">
            <strong>Howard the Chronicler</strong> calls for a <strong>${esc(check.skillName)}</strong> check
          </div>
        </div>
        <div class="spell-chat-body">
          <div class="spell-chat-meta">
            <strong>${esc(check.skillName)}</strong> &nbsp;|&nbsp; <span style="color: #FFD700;">Difficulty ${check.dc}</span>
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      content,
      speaker: { alias: "Howard the Chronicler" }
    });

    if (game.user.isGM) {
      this._openCheckDialog(check);
    }
  }

  /** Open a read-only GM Notes dialog for the current page in Presentation mode */
  async _openPresGmNotes() {
    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    // Ensure enemy lookup is loaded for drag-to-canvas
    if (!HowardSheet._enemyCategories) await HowardSheet._loadEnemyLookup();

    const gmNotes = currentPage.gmNotes || {};
    const enemies = currentPage.enemies || [];
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    // Build page title — use gmNotes.title if set, fallback to "Page N"
    const pageTitle = gmNotes.title || `Page ${this._readerPageIndex + 1}`;

    // Build enemy/actor tags HTML
    let enemyHtml = '';
    if (enemies.length) {
      enemyHtml = '<div class="pres-gm-section"><label class="pres-gm-label">Actors</label><div class="pres-gm-enemy-tags">';
      for (const e of enemies) {
        const hasUuid = !!e.uuid;
        const hasCategory = !!e.category && e.category !== 'null';
        const isLinked = hasUuid || hasCategory;
        const cls = isLinked ? 'pres-gm-enemy-tag pres-gm-enemy-linked' : 'pres-gm-enemy-tag';
        const imgHtml = e.img ? `<img class="howard-enemy-tag-img" src="${e.img}" />` : '';
        let dragAttr = '';
        if (hasUuid) dragAttr = `draggable="true" data-uuid="${e.uuid}"`;
        else if (hasCategory) dragAttr = `draggable="true" data-category="${e.category}" data-group="${e.group}" data-enemy-id="${e.enemyId}"`;
        enemyHtml += `<span class="${cls}" ${dragAttr}>${imgHtml}${esc(e.name)}</span>`;
      }
      enemyHtml += '</div></div>';
    }

    // Build notes HTML
    let notesHtml = '';
    if (gmNotes.notes) {
      notesHtml = `<div class="pres-gm-section"><label class="pres-gm-label">Notes</label><div class="pres-gm-notes-text">${esc(gmNotes.notes)}</div></div>`;
    }

    // Build checks summary
    const checksObj = currentPage.checks || {};
    const checks = Array.isArray(checksObj) ? [] : Object.values(checksObj);
    let checksHtml = '';
    if (checks.length) {
      checksHtml = '<div class="pres-gm-section"><label class="pres-gm-label">Checks</label><div class="pres-gm-checks">';
      for (const c of checks) {
        checksHtml += `<span class="pres-gm-check-tag" data-check-id="${c.id}" title="${esc(c.prompt)}"><i class="fas fa-dice-d20"></i> ${esc(c.skillName)} DC ${c.dc}</span>`;
      }
      checksHtml += '</div></div>';
    }

    // Fight scene button
    const combatSceneId = gmNotes.combatScene || '';
    const combatScene = combatSceneId ? game.scenes.get(combatSceneId) : null;
    const fightBtnHtml = combatScene
      ? `<button type="button" class="pres-gm-fight-btn" data-scene-id="${combatSceneId}"><i class="fas fa-swords"></i></button>`
      : '';

    const content = `
      <div class="pres-gm-dialog">
        <div class="pres-gm-title-row">
          <div class="pres-gm-title">${esc(pageTitle)}</div>
          ${fightBtnHtml}
        </div>
        ${enemyHtml}
        ${checksHtml}
        ${notesHtml}
        ${!enemyHtml && !checksHtml && !notesHtml ? '<div class="pres-gm-empty">No GM notes for this page.</div>' : ''}
      </div>
    `;

    const dlg = new Dialog({
      title: `GM Notes — ${pageTitle}`,
      content,
      buttons: { close: { label: 'Close' } },
      default: 'close',
      render: (html) => {
        // Wire enemy drag-to-canvas (native dragstart — canvas picks up ConanEnemy format)
        html.find('.pres-gm-enemy-linked').each((i, el) => {
          el.addEventListener('dragstart', (ev) => {
            const category = el.dataset.category;
            const group = el.dataset.group;
            const enemyId = el.dataset.enemyId;
            if (!category || !group || !enemyId) return;

            const cats = HowardSheet._enemyCategories;
            if (!cats) return;
            const enemyBase = cats[category]?.groups?.[group]?.enemies?.find(e => e.id === enemyId);
            if (!enemyBase) return;

            const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const tokenImg = enemyBase.tokenImg || 'icons/svg/mystery-man.svg';
            const portraitImg = enemyBase.portraitImg || tokenImg;
            const physDef = enemyBase.defenses?.physical ? randomInRange(enemyBase.defenses.physical.min, enemyBase.defenses.physical.max) : null;
            const sorcDef = enemyBase.defenses?.sorcery ? randomInRange(enemyBase.defenses.sorcery.min, enemyBase.defenses.sorcery.max) : null;
            const ar = enemyBase.ar ? randomInRange(enemyBase.ar.min, enemyBase.ar.max) : null;
            const groupBackgrounds = ((() => { try { return game.settings.get('conan', 'enemyGroupBackgrounds'); } catch(e) { return {}; } })()) || {};
            const groupBackground = groupBackgrounds[`${category}.${group}`] || '';

            const dragData = {
              type: 'ConanEnemy',
              enemy: { ...enemyBase, category, group, tokenImg, portraitImg, groupBackground, physicalDefense: physDef, sorceryDefense: sorcDef, armorRating: ar }
            };
            ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
          });
        });

        // Wire check tag click → fire the check
        html.find('.pres-gm-check-tag').click((ev) => {
          const checkId = ev.currentTarget.dataset.checkId;
          if (checkId) this._fireCheck(checkId);
        });

        // Wire FIGHT button — pull everyone to the combat scene
        html.find('.pres-gm-fight-btn').click(async (ev) => {
          const sceneId = ev.currentTarget.dataset.sceneId;
          const scene = game.scenes.get(sceneId);
          if (!scene) return ui.notifications.warn('Fight scene not found.');
          await scene.activate();
        });
      }
    }, { width: 340, height: 400, resizable: true, classes: ['bpm-dialog-window', 'pres-gm-notes-dialog'] });
    dlg.render(true);
  }

  /** Toggle element visibility in Presentation mode — hide↔show + broadcast to players */
  async _presToggleElement(elId) {
    const basePath = this._getPageBasePath();
    if (!basePath) return;

    const tale = this.actor.system.tales[this._activeTaleId];
    if (!tale?.pages) return;
    const pages = Object.values(tale.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const currentPage = pages[this._readerPageIndex];
    if (!currentPage) return;

    const hiddenObj = currentPage.hiddenElements || {};
    const isCurrentlyHidden = !!hiddenObj[elId];

    if (isCurrentlyHidden) {
      // REVEAL — remove from hiddenElements
      await this.actor.update({ [`${basePath}.hiddenElements.-=${elId}`]: null }, { render: false });
    } else {
      // HIDE — add to hiddenElements
      await this.actor.update({ [`${basePath}.hiddenElements.${elId}`]: true }, { render: false });
    }

    // DOM update on GM side
    const el = this.element.find(`[data-panel-id="${elId}"], [data-tb-id="${elId}"], [data-sb-id="${elId}"]`);
    if (isCurrentlyHidden) {
      el.find('.howard-hidden-eye').remove();
      this.element.find(`.howard-speech-tail-svg polygon[data-sb-id="${elId}"]`).removeClass('howard-element-hidden');
    } else {
      if (!el.find('.howard-hidden-eye').length) {
        el.append('<div class="howard-hidden-eye"><i class="fas fa-eye-slash"></i></div>');
      }
      this.element.find(`.howard-speech-tail-svg polygon[data-sb-id="${elId}"]`).addClass('howard-element-hidden');
    }

    // Update the eye icon on the control overlay
    const eyeBtn = el.find('.howard-pres-eye i');
    if (isCurrentlyHidden) {
      eyeBtn.removeClass('fa-eye-slash').addClass('fa-eye');
    } else {
      eyeBtn.removeClass('fa-eye').addClass('fa-eye-slash');
    }

    // Broadcast to players
    const msg = await ChatMessage.create({
      content: '', whisper: [], blind: true,
      flags: {
        "howard-chronicler": {
          howardPresReveal: true,
          action: isCurrentlyHidden ? 'reveal' : 'hide',
          elId: elId,
          taleId: this._activeTaleId,
          pageIndex: this._readerPageIndex
        }
      }
    });
    if (msg) msg.delete();
  }

  async _dismissAllPlayers() {
    const msg = await ChatMessage.create({
      content: '',
      whisper: [],
      blind: true,
      flags: {
        "howard-chronicler": {
          howardDismiss: true
        }
      }
    });
    if (msg) msg.delete();

    ui.notifications.info("Closed Howard on all player screens.");
  }

  /**
   * Handle a "show" broadcast received on a player client.
   * Opens Howard at the target tale/page, with cover animation on first show.
   */
  static async handleShowBroadcast(taleId, pageIndex) {
    // Find the Howard actor
    const howard = game.actors.find(a => a.type === 'howard-chronicler.howard');
    if (!howard) return;

    // Verify the tale exists
    const tale = howard.system.tales?.[taleId];
    if (!tale) return;

    const sheet = howard.sheet;
    const coverAlreadyShown = HowardSheet._coverShownTales[taleId];

    if (!coverAlreadyShown) {
      // First time this session — show cover, then flip to target page
      HowardSheet._coverShownTales[taleId] = true;

      // Open in rack mode centered on this tale
      sheet._viewMode = 'rack';
      sheet._activeTaleId = null;
      sheet._playerShowMode = true;

      // Center the rack on the target tale
      const talesList = Object.values(howard.system.tales)
        .sort((a, b) => a.issueNumber - b.issueNumber);
      const taleIdx = talesList.findIndex(t => t.id === taleId);
      if (taleIdx >= 0) sheet._currentIndex = taleIdx;

      // Render the sheet (opens it if not already open)
      sheet.render(true);

      // After a moment showing the cover, transition to reader mode
      setTimeout(() => {
        sheet._viewMode = 'reader';
        sheet._activeTaleId = taleId;
        sheet._readerPageIndex = pageIndex;
        sheet.render(false);
        sheet._updateWindowTitle();
      }, 2000);
    } else {
      // Subsequent show — go directly to the page
      sheet._viewMode = 'reader';
      sheet._activeTaleId = taleId;
      sheet._readerPageIndex = pageIndex;
      sheet._playerShowMode = true;
      sheet.render(true);
      setTimeout(() => sheet._updateWindowTitle(), 100);
    }
  }

  /**
   * Handle a "dismiss" broadcast — close the sheet on player side.
   */
  static handleDismissBroadcast() {
    const howard = game.actors.find(a => a.type === 'howard-chronicler.howard');
    if (!howard) return;

    const sheet = howard.sheet;
    if (sheet.rendered) {
      sheet._playerShowMode = false;
      sheet.close();
    }
  }

  /**
   * Handle a "reveal" broadcast — toggle a panel or text block on the player side.
   * Does a targeted DOM update instead of a full re-render.
   */
  static handleRevealBroadcast(action, key, pageId) {
    const howard = game.actors.find(a => a.type === 'howard-chronicler.howard');
    if (!howard) return;

    const sheet = howard.sheet;
    if (!sheet.rendered) return;

    // Only act if the player is viewing the same page
    const html = sheet.element;
    const isTextBlock = key.startsWith('tb-');

    if (action === 'reveal') {
      if (isTextBlock) {
        const el = html.find(`.howard-text-block[data-tb-id="${key}"]`);
        if (el.length) el.removeClass('howard-tb-unrevealed').addClass('howard-tb-revealed');
      } else {
        const el = html.find(`.howard-panel[data-slot="${key}"]`);
        if (el.length) el.removeClass('howard-panel-unrevealed').addClass('howard-panel-revealed');
      }
    } else if (action === 'hide') {
      if (isTextBlock) {
        const el = html.find(`.howard-text-block[data-tb-id="${key}"]`);
        if (el.length) el.removeClass('howard-tb-revealed').addClass('howard-tb-unrevealed');
      } else {
        const el = html.find(`.howard-panel[data-slot="${key}"]`);
        if (el.length) el.removeClass('howard-panel-revealed').addClass('howard-panel-unrevealed');
      }
    }
  }

  /**
   * Handle a Presentation reveal/hide broadcast on the player side.
   * Navigates to the correct page if needed, then shows/hides the element.
   */
  static async handlePresRevealBroadcast(action, elId, taleId, pageIndex) {
    const howard = game.actors.find(a => a.type === 'howard-chronicler.howard');
    if (!howard) return;

    const sheet = howard.sheet;

    // Navigate to the correct tale/page if not already there
    const needsNav = !sheet.rendered ||
      sheet._activeTaleId !== taleId ||
      sheet._readerPageIndex !== pageIndex;

    if (needsNav) {
      // Open the comic at the right page
      sheet._viewMode = 'reader';
      sheet._activeTaleId = taleId;
      sheet._readerPageIndex = pageIndex;
      sheet._playerShowMode = true;
      sheet.render(true);

      // Wait for render to complete, then apply DOM update
      setTimeout(() => {
        HowardSheet._applyPresRevealDOM(sheet, action, elId);
      }, 300);
    } else {
      // Already on the right page — just update DOM
      HowardSheet._applyPresRevealDOM(sheet, action, elId);
    }
  }

  /** Apply a Presentation reveal/hide to the DOM on the player side */
  static _applyPresRevealDOM(sheet, action, elId) {
    const html = sheet.element;
    if (!html?.length) return;

    // Find the element by any data attribute
    const el = html.find(`[data-panel-id="${elId}"], [data-tb-id="${elId}"], [data-sb-id="${elId}"]`);
    const tail = html.find(`.howard-speech-tail-svg polygon[data-sb-id="${elId}"]`);

    if (action === 'reveal') {
      el.removeClass('howard-pres-hidden');
      tail.removeClass('howard-pres-hidden-svg');
    } else if (action === 'hide') {
      el.addClass('howard-pres-hidden');
      tail.addClass('howard-pres-hidden-svg');
    }
  }

  /**
   * Handle a Presentation zoom broadcast on the player side.
   * Navigates to the correct page if needed, then shows zoom overlay.
   */
  static async handlePresZoomBroadcast(taleId, pageIndex, elId) {
    const howard = game.actors.find(a => a.type === 'howard-chronicler.howard');
    if (!howard) return;

    const sheet = howard.sheet;

    const needsNav = !sheet.rendered ||
      sheet._activeTaleId !== taleId ||
      sheet._readerPageIndex !== pageIndex;

    if (needsNav) {
      sheet._viewMode = 'reader';
      sheet._activeTaleId = taleId;
      sheet._readerPageIndex = pageIndex;
      sheet._playerShowMode = true;
      sheet.render(true);
      setTimeout(() => {
        HowardSheet._showZoomOverlay(sheet, elId);
      }, 400);
    } else {
      HowardSheet._showZoomOverlay(sheet, elId);
    }
  }

  /**
   * Show a zoom overlay — clones just the targeted panel/text/speech element
   * and scales it to fill the middle 50% of the page. Click to dismiss.
   */
  static _showZoomOverlay(sheet, elId) {
    const html = sheet.element;
    if (!html?.length) return;

    // Remove any existing zoom overlay
    html.find('.howard-zoom-overlay').remove();

    // Find the original element
    const el = html.find(`[data-panel-id="${elId}"], [data-tb-id="${elId}"], [data-sb-id="${elId}"]`);
    if (!el.length) return;

    // Read the original panel's dimensions to preserve its aspect ratio
    const style = el.attr('style') || '';
    const pctMatch = (prop) => {
      const re = new RegExp(prop + ':\\s*([\\d.]+)%');
      const m = style.match(re);
      return m ? parseFloat(m[1]) : null;
    };
    const origW = ((pctMatch('width') ?? 50) / 100) * 520;
    const origH = ((pctMatch('height') ?? 50) / 100) * 780;

    // Scale to fit within 490x370 viewport while keeping the panel's aspect ratio
    const maxW = 490;
    const maxH = 370;
    const scale = Math.min(maxW / origW, maxH / origH);
    const zoomW = Math.round(origW * scale);
    const zoomH = Math.round(origH * scale);

    // Recreate the panel at zoom size — same aspect ratio means % positions match
    const zoomPanel = $('<div class="howard-zoom-panel"></div>');
    zoomPanel.css({ width: `${zoomW}px`, height: `${zoomH}px` });

    // Copy all child images with their percentage-based styles
    el.find('img').each(function () {
      const img = $(this);
      const clone = $('<img />');
      clone.attr('src', img.attr('src'));
      clone.attr('style', img.attr('style'));
      clone.addClass('howard-layer-image');
      zoomPanel.append(clone);
    });

    // Copy text content if any
    const inner = el.find('.howard-panel-content');
    if (inner.length) {
      zoomPanel.append($('<div class="howard-panel-inner"><div class="howard-panel-content">' + inner.html() + '</div></div>'));
    }

    // Build the overlay
    const overlay = $(`<div class="howard-zoom-overlay">
      <div class="howard-zoom-backdrop"></div>
      <div class="howard-zoom-content"></div>
    </div>`);

    overlay.find('.howard-zoom-content').append(zoomPanel);

    // Click to dismiss
    overlay.on('click', () => {
      overlay.addClass('howard-zoom-dismissing');
      setTimeout(() => overlay.remove(), 300);
    });

    // Append inside the howard-page so it scales with the comic
    const page = html.find('.howard-page');
    if (page.length) {
      page.append(overlay);
    } else {
      html.find('.howard-editor-layout').append(overlay);
    }

    overlay.addClass('howard-zoom-visible');
  }

  async close(options = {}) {
    this._teardownPageScaling();
    this._playerShowMode = false;
    return super.close(options);
  }
}
