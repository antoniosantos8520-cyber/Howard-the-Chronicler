/**
 * Howard the Chronicler — Standalone Module Init
 * Registers the howard actor type, auto-creates the singleton,
 * and wires up broadcast hooks for GM→player communication.
 */

import HowardSheet from "./howard-sheet.js";

const MODULE_ID = 'howard-chronicler';
const ACTOR_TYPE = `${MODULE_ID}.howard`;

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
  // Show to Players
  if (message.getFlag(MODULE_ID, 'howardShow')) {
    if (!game.user.isGM) {
      const taleId = message.getFlag(MODULE_ID, 'taleId');
      const pageIndex = message.getFlag(MODULE_ID, 'pageIndex') ?? 0;
      HowardSheet.handleShowBroadcast(taleId, pageIndex);
    }
  }

  // Panel/text block reveal/hide (legacy)
  if (message.getFlag(MODULE_ID, 'howardReveal')) {
    if (!game.user.isGM) {
      const action = message.getFlag(MODULE_ID, 'action');
      const key = message.getFlag(MODULE_ID, 'key');
      const pageId = message.getFlag(MODULE_ID, 'pageId');
      HowardSheet.handleRevealBroadcast(action, key, pageId);
    }
  }

  // Presentation mode reveal/hide
  if (message.getFlag(MODULE_ID, 'howardPresReveal')) {
    if (!game.user.isGM) {
      const action = message.getFlag(MODULE_ID, 'action');
      const elId = message.getFlag(MODULE_ID, 'elId');
      const taleId = message.getFlag(MODULE_ID, 'taleId');
      const pageIndex = message.getFlag(MODULE_ID, 'pageIndex');
      HowardSheet.handlePresRevealBroadcast(action, elId, taleId, pageIndex);
    }
  }

  // Presentation mode zoom
  if (message.getFlag(MODULE_ID, 'howardPresZoom')) {
    if (!game.user.isGM) {
      const taleId = message.getFlag(MODULE_ID, 'taleId');
      const pageIndex = message.getFlag(MODULE_ID, 'pageIndex');
      const elId = message.getFlag(MODULE_ID, 'elId');
      HowardSheet.handlePresZoomBroadcast(taleId, pageIndex, elId);
    }
  }

  // Page visibility changed — re-render player view
  if (message.getFlag(MODULE_ID, 'howardPageVisibility')) {
    if (!game.user.isGM) {
      const howard = game.actors.find(a => a.type === ACTOR_TYPE);
      if (howard?.sheet?.rendered) {
        howard.sheet.render(false);
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

