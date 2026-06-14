/**
 * Howard the Chronicler — Standalone Module Init
 * Registers the howard actor type, auto-creates the singleton,
 * and wires up broadcast hooks for GM→player communication.
 */

import HowardSheet from "./howard-sheet.js";
import HowardTheaterLayer from "./howard-the-chronicler-layer.js";

const MODULE_ID = 'howard-the-chronicler';
const ACTOR_TYPE = `${MODULE_ID}.howard`;
const THEATER_SCENE_NAME = 'Theater';

/**
 * DataModel for the howard actor type.
 * Defines the schema that lives in actor.system
 */
class HowardActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      tales: new fields.ObjectField(),
      activeTale: new fields.StringField({ nullable: true, initial: null }),
      settings: new fields.SchemaField({
        viewMode: new fields.StringField({ initial: "default" })
      })
    };
  }
}

/* ----------------------------------------
   INIT — Register DataModel, sheet, settings
   ---------------------------------------- */
Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing Howard the Chronicler`);

  // Register the DataModel for our actor sub-type
  CONFIG.Actor.dataModels[ACTOR_TYPE] = HowardActorData;

  // Register sheet
  Actors.registerSheet(MODULE_ID, HowardSheet, {
    types: [ACTOR_TYPE],
    makeDefault: true,
    label: "Howard the Chronicler"
  });

  // Register module settings
  game.settings.register(MODULE_ID, 'enemyDataPath', {
    name: 'Enemy Data Path',
    hint: 'Path to a JSON file with enemy/NPC data for the GM panel drag feature. Leave empty to disable.',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  game.settings.register(MODULE_ID, 'theaterBackground', {
    name: 'Theater Background Image',
    hint: 'Path to a background image for the Theater scene (e.g. modules/howard-the-chronicler/images/theater-bg.jpg). Applied as the scene background behind the comic page.',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  // Register the Theater canvas layer
  CONFIG.Canvas.layers.howardTheater = { layerClass: HowardTheaterLayer, group: "primary" };

  // Preload template
  loadTemplates([
    `modules/${MODULE_ID}/templates/howard-sheet.hbs`
  ]);
});

/* ----------------------------------------
   READY — Auto-create singleton Howard actor
   ---------------------------------------- */
Hooks.once('ready', async () => {
  if (!game.user.isGM) return;

  const existingHoward = game.actors.find(a => a.type === ACTOR_TYPE);
  if (!existingHoward) {
    console.log(`${MODULE_ID} | Creating Howard the Chronicler actor`);
    await Actor.create({
      name: 'Howard the Chronicler',
      type: ACTOR_TYPE,
      img: `modules/${MODULE_ID}/images/howard.png`,
      'prototypeToken.texture.src': `modules/${MODULE_ID}/images/howard.png`,
      'prototypeToken.name': 'Howard the Chronicler',
      'prototypeToken.actorLink': true,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    }, { howardAutoCreate: true });
  }

  // Auto-create Theater scene (singleton)
  const existingTheater = game.scenes.find(s => s.getFlag(MODULE_ID, 'isTheater'));
  if (!existingTheater) {
    console.log(`${MODULE_ID} | Creating Theater scene`);
    await Scene.create({
      name: THEATER_SCENE_NAME,
      width: 900,
      height: 1200,
      padding: 0,
      backgroundColor: '#2a2a2e',
      grid: { type: 0 },           // gridless
      tokenVision: false,
      fogExploration: false,
      flags: { [MODULE_ID]: { isTheater: true } }
    });
  }

  // Auto-configure enemy data path if blank and known file exists
  const currentEnemyPath = game.settings.get(MODULE_ID, 'enemyDataPath');
  if (!currentEnemyPath) {
    const candidatePaths = [
      'systems/conan/data/enemies.json'
    ];
    for (const path of candidatePaths) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (res.ok) {
          await game.settings.set(MODULE_ID, 'enemyDataPath', path);
          console.log(`${MODULE_ID} | Auto-set enemy data path: ${path}`);
          break;
        }
      } catch (e) { /* not found, try next */ }
    }
  }

  // Apply theater background image setting to the Theater scene
  const theaterScene = game.scenes.find(s => s.getFlag(MODULE_ID, 'isTheater'));
  const bgPath = game.settings.get(MODULE_ID, 'theaterBackground');
  if (theaterScene && bgPath && theaterScene.background?.src !== bgPath) {
    await theaterScene.update({ 'background.src': bgPath });
    console.log(`${MODULE_ID} | Applied theater background: ${bgPath}`);
  }
});

/* ----------------------------------------
   GUARDS — Prevent duplicate / accidental deletion
   ---------------------------------------- */

// Prevent manual creation of duplicate Howard actors
Hooks.on('preCreateActor', (actor, data, options, userId) => {
  if (actor.type === ACTOR_TYPE && !options.howardAutoCreate) {
    const existingHoward = game.actors.find(a => a.type === ACTOR_TYPE);
    if (existingHoward) {
      ui.notifications.warn('Howard the Chronicler already exists. There can be only one!');
      return false;
    }
  }
});

// Prevent deletion of Howard
Hooks.on('preDeleteActor', (actor, options, userId) => {
  if (actor.type === ACTOR_TYPE) {
    ui.notifications.error('Howard the Chronicler cannot be deleted. He is eternal.');
    return false;
  }
});

// Prevent deletion of Theater scene
Hooks.on('preDeleteScene', (scene) => {
  if (scene.getFlag(MODULE_ID, 'isTheater')) {
    ui.notifications.error('The Theater scene cannot be deleted.');
    return false;
  }
});

// Hide howard from the Create Actor dropdown
Hooks.on('renderDialog', (dialog, html, data) => {
  if (dialog.data?.title === 'Create New Actor' || dialog.title === 'Create New Actor') {
    const select = html.find('select[name="type"]');
    if (select.length) {
      select.find(`option[value="${ACTOR_TYPE}"]`).remove();
    }
  }
});

/* ----------------------------------------
   BROADCASTS — GM → Player communication
   via invisible ChatMessages with flags
   ---------------------------------------- */
Hooks.on('createChatMessage', (message) => {
  // Helper: is this player currently on the Theater scene?
  const onTheaterScene = () => !!canvas.scene?.getFlag(MODULE_ID, 'isTheater');

  // Show to Players
  if (message.getFlag(MODULE_ID, 'howardShow')) {
    if (!game.user.isGM) {
      // On Theater scene the canvas layer handles display — skip dialog auto-open
      if (!onTheaterScene()) {
        const taleId = message.getFlag(MODULE_ID, 'taleId');
        const pageIndex = message.getFlag(MODULE_ID, 'pageIndex') ?? 0;
        HowardSheet.handleShowBroadcast(taleId, pageIndex);
      }
    }
  }

  // Panel/text block reveal/hide (legacy)
  if (message.getFlag(MODULE_ID, 'howardReveal')) {
    if (!game.user.isGM) {
      if (!onTheaterScene()) {
        const action = message.getFlag(MODULE_ID, 'action');
        const key = message.getFlag(MODULE_ID, 'key');
        const pageId = message.getFlag(MODULE_ID, 'pageId');
        HowardSheet.handleRevealBroadcast(action, key, pageId);
      }
    }
  }

  // Presentation mode reveal/hide
  if (message.getFlag(MODULE_ID, 'howardPresReveal')) {
    if (!game.user.isGM) {
      const action = message.getFlag(MODULE_ID, 'action');
      const elId = message.getFlag(MODULE_ID, 'elId');

      // Update the theater canvas layer if on Theater scene
      if (onTheaterScene()) {
        const layer = canvas.howardTheater;
        if (layer) {
          layer.setElementVisibility(elId, action === 'reveal');
        }
      } else {
        // Not on Theater — update the dialog sheet
        const taleId = message.getFlag(MODULE_ID, 'taleId');
        const pageIndex = message.getFlag(MODULE_ID, 'pageIndex');
        HowardSheet.handlePresRevealBroadcast(action, elId, taleId, pageIndex);
      }
    }
  }

  // Presentation mode zoom (no-op on Theater scene — native VTT zoom available)
  if (message.getFlag(MODULE_ID, 'howardPresZoom')) {
    if (!game.user.isGM && !onTheaterScene()) {
      const taleId = message.getFlag(MODULE_ID, 'taleId');
      const pageIndex = message.getFlag(MODULE_ID, 'pageIndex');
      const elId = message.getFlag(MODULE_ID, 'elId');
      HowardSheet.handlePresZoomBroadcast(taleId, pageIndex, elId);
    }
  }

  // Page visibility changed — re-render player view (only if dialog is open)
  if (message.getFlag(MODULE_ID, 'howardPageVisibility')) {
    if (!game.user.isGM) {
      const howard = game.actors.find(a => a.type === ACTOR_TYPE);
      if (howard?.sheet?.rendered) {
        howard.sheet.render(false);
      }
    }
  }

  // Theater publish — update the theater canvas layer on player clients
  if (message.getFlag(MODULE_ID, 'howardTheaterPublish')) {
    if (!game.user.isGM) {
      const taleId = message.getFlag(MODULE_ID, 'taleId');
      const pageIndex = message.getFlag(MODULE_ID, 'pageIndex');
      const layer = canvas.howardTheater;
      if (layer) {
        layer.publishPage(taleId, pageIndex);
      }
    }
  }

  // Dismiss on all player screens
  if (message.getFlag(MODULE_ID, 'howardDismiss')) {
    if (!game.user.isGM) {
      HowardSheet.handleDismissBroadcast();
    }
  }
});

