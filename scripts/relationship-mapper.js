const MODULE_ID = "relationship-mapper";
const FLAG_KEY = "sceneMap";

const RMP = {
  root: null,
  pointerDownOutsideControls: false,
  pointerDownOnControl: false,
  edges: null,
  nodes: null,
  ui: null,
  nodeViews: new Map(),
  edgeHitViews: new Map(),
  edgeCurves: new Map(),
  connectFrom: null,
  connectFromAnchor: null,
  dragging: null,
  resizing: null,
  previewPoint: null,
  tooltip: null,
  controls: null,
  controlsNodeId: null,
  controlsOver: false,
  hoverNodeId: null,
  controlsTimer: null,
  controlsRaf: null,
  domResizing: null,
  selectedEdge: null,
  previewMoveBound: null,
  previewCancelBound: null,
  stagePointerDownBound: null,
  redrawEdgeId: null,
  controlHover: false,
  pointerGuardsInstalled: false
};

const clone = obj => foundry.utils.deepClone(obj ?? {});
const rid = () => foundry.utils.randomID();
const scene = () => canvas?.scene ?? game.scenes?.active ?? game.scenes?.current;
const emptyBoard = () => ({ nodes: [], edges: [] });
const board = () => clone(scene()?.getFlag(MODULE_ID, FLAG_KEY) ?? emptyBoard());
const DEFAULTS_STORAGE_KEY = `${MODULE_ID}.defaults.v1`;

const STONETOP_ASSET_BASE = "/systems/stonetop/assets/sheet";
const isStonetopTheme = () => game?.system?.id === "stonetop";
const stonetopAsset = name => `${STONETOP_ASSET_BASE}/${name}`;
const stonetopCardTextColor = () => "#1a1a1a";
const stonetopCardTint = () => "#ffffff";
const stonetopTitleFont = () => "StonetopUI";
const stonetopBodyFont = () => {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--font-primary").trim();
    return value || "Signika";
  } catch (_err) {
    return "Signika";
  }
};
function userDefaults() {
  try {
    const raw = localStorage.getItem(DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch (_err) {
    return {};
  }
}
const setting = (key, fallback) => {
  const defaults = userDefaults();
  if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key] ?? fallback;
  return fallback;
};
const snapCardsToGrid = () => {
  const defaults = userDefaults();
  if (typeof defaults.snapCardsToGrid === "boolean") return defaults.snapCardsToGrid;
  return true;
};
const gridSnapSize = () => Math.max(1, Number(canvas?.grid?.size || scene()?.grid?.size || 100));
const snapValue = value => snapCardsToGrid() ? Math.round(Number(value || 0) / gridSnapSize()) * gridSnapSize() : Math.round(Number(value || 0));
const snapSizeValue = value => snapCardsToGrid() ? Math.max(gridSnapSize(), Math.round(Number(value || 0) / gridSnapSize()) * gridSnapSize()) : Math.round(Number(value || 0));
const CARD_ASPECT = 1.27;
const clampCardWidth = value => Math.max(110, Math.min(480, Number(value || 180)));
const snapCardWidth = value => clampCardWidth(snapCardsToGrid() ? snapSizeValue(value) : Math.round(Number(value || 0)));
function applyCardSizeFromWidth(node, width) {
  node.width = snapCardWidth(width);
  node.height = Math.round(node.width * CARD_ASPECT);
}
function fitSpriteInside(sprite, x, y, maxW, maxH) {
  sprite.x = x;
  sprite.y = y;
  const tex = sprite.texture;
  const tw = Number(tex?.orig?.width || tex?.width || 0);
  const th = Number(tex?.orig?.height || tex?.height || 0);
  if (!tw || !th) { sprite.width = maxW; sprite.height = maxH; return; }
  const scale = Math.min(maxW / tw, maxH / th);
  sprite.width = tw * scale;
  sprite.height = th * scale;
  sprite.x = x + (maxW - sprite.width) / 2;
  sprite.y = y + (maxH - sprite.height) / 2;
}
const defaultConnectionColor = () => setting("defaultConnectionColor", "#000000") || "#000000";
const defaultConnectionStyle = () => setting("defaultConnectionStyle", "solid") || "solid";
const ropeColor = () => defaultConnectionColor();
const defaultCardTint = () => isStonetopTheme() ? stonetopCardTint() : (setting("defaultCardTint", "#f1e0b7") || "#f1e0b7");
const defaultCardTextColor = () => isStonetopTheme() ? stonetopCardTextColor() : (setting("defaultCardTextColor", "#24180f") || "#24180f");
const defaultCardFontFamily = () => isStonetopTheme() ? stonetopTitleFont() : (setting("defaultCardFontFamily", "Arial") || "Arial");
const defaultCardFontSize = () => Number(setting("defaultCardFontSize", 15) || 15);
const defaultCardWidth = () => Number(setting("defaultCardWidth", 180) || 180);
const defaultConnectionWidth = () => Number(setting("defaultConnectionWidth", 4) || 4);
const defaultConnectionDirection = () => setting("defaultConnectionDirection", "from-to") || "from-to";
const defaultConnectionLabel = () => setting("defaultConnectionLabel", "") || "";
const defaultConnectionLabelFontFamily = () => isStonetopTheme() ? stonetopTitleFont() : (setting("defaultConnectionLabelFontFamily", "Arial") || "Arial");
const defaultConnectionLabelFontSize = () => Number(setting("defaultConnectionLabelFontSize", 18) || 18);
const defaultConnectionLabelColor = () => isStonetopTheme() ? stonetopCardTextColor() : (setting("defaultConnectionLabelColor", "#ffffff") || "#ffffff");
const defaultConnectionLabelBackground = () => isStonetopTheme() ? "#ffffff" : (setting("defaultConnectionLabelBackground", "#000000") || "#000000");
const toNum = color => PIXI.Color.shared.setValue(color || "#000000").toNumber();
const faMajor = () => Number(String(game?.version ?? "13").split(".")[0]) || 13;
const faClass = name => {
  const v14 = faMajor() >= 14;
  const map = {
    diagram: v14 ? "fa-solid fa-diagram-project" : "fas fa-project-diagram",
    source: v14 ? "fa-solid fa-up-right-from-square" : "fas fa-external-link-alt",
    connect: v14 ? "fa-solid fa-link" : "fas fa-link",
    edit: v14 ? "fa-solid fa-pen-to-square" : "fas fa-pen",
    delete: v14 ? "fa-solid fa-trash-can" : "fas fa-trash",
    save: v14 ? "fa-solid fa-floppy-disk" : "fas fa-save",
    resize: v14 ? "fa-solid fa-up-right-and-down-left-from-center" : "fas fa-expand-alt"
  };
  return map[name] ?? (v14 ? "fa-solid fa-circle" : "fas fa-circle");
};
const faIcon = name => `<i class="${faClass(name)}"></i>`;
const FA_FONT = () => faMajor() >= 14 ? "Font Awesome 7 Free, Font Awesome 6 Free, Font Awesome 5 Free" : "Font Awesome 6 Free, Font Awesome 5 Free";
const faGlyph = name => {
  const map = { connect:"\uf0c1", edit:"\uf044", source:"\uf35d", delete:"\uf2ed", resize:"\uf065", diagram:"\uf542" };
  return map[name] ?? "?";
};
const cardFont = n => isStonetopTheme() ? stonetopTitleFont() : (n.fontFamily || "Arial");
const edgeFont = e => isStonetopTheme() ? stonetopTitleFont() : (e.labelFontFamily || "Arial");
const esc = s => String(s ?? "").replace(/[&<>'\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));

function availableFontChoices() {
  const names = new Set(["Arial", "Signika", "serif", "sans-serif", "monospace"]);
  if (isStonetopTheme()) names.add(stonetopTitleFont());
  try {
    const defs = CONFIG?.fontDefinitions;
    if (defs instanceof Map) for (const key of defs.keys()) names.add(key);
    else if (defs && typeof defs === "object") Object.keys(defs).forEach(k => names.add(k));
  } catch (_err) {}
  try {
    const families = CONFIG?.fontFamilies;
    if (Array.isArray(families)) families.forEach(f => names.add(String(f)));
    else if (families && typeof families === "object") Object.keys(families).forEach(k => names.add(k));
  } catch (_err) {}
  try {
    const fonts = game?.settings?.get?.("core", "fonts");
    if (Array.isArray(fonts)) fonts.forEach(f => names.add(String(f?.family ?? f?.name ?? f)));
    else if (fonts && typeof fonts === "object") Object.keys(fonts).forEach(k => names.add(k));
  } catch (_err) {}
  return [...names].filter(Boolean).sort((a,b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function fontOptionData(current) {
  const cur = String(current || "Arial");
  const fonts = availableFontChoices();
  if (!fonts.includes(cur)) fonts.unshift(cur);
  return fonts.map(f => ({ value: f, label: f, selected: f === cur }));
}

function fontSelectHtml(name, current) {
  return `<select name="${name}">${fontOptionData(current).map(f => `<option value="${esc(f.value)}" ${f.selected ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select>`;
}

function rangeHtml(name, value, { min = 1, max = 30, step = 1 } = {}) {
  const v = Number(value ?? min);
  return `<div class="rmp-range-row"><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${v}" oninput="this.nextElementSibling.textContent=this.value"><span>${v}</span></div>`;
}


function DialogV2Class() {
  return foundry?.applications?.api?.DialogV2;
}

function asHtmlArg(element) {
  const root = element?.querySelector?.(".window-content") || element;
  return { 0: root, length: 1, find: sel => $(root).find(sel) };
}

function renderRelationshipDialog({ title, content, buttons = {}, defaultButton = null, close = null, render = null }) {
  const DialogV2 = DialogV2Class();
  if (DialogV2) {
    const v2Buttons = Object.entries(buttons).map(([action, cfg]) => ({
      action,
      label: cfg.label ?? action,
      icon: cfg.icon ?? "",
      default: action === defaultButton,
      callback: async (_event, _button, dialog) => {
        if (typeof cfg.callback === "function") return cfg.callback(asHtmlArg(dialog.element));
        return action;
      }
    }));
    const dialog = new DialogV2({
      window: { title },
      content,
      buttons: v2Buttons,
      rejectClose: false
    });
    if (typeof close === "function") dialog.addEventListener?.("close", close);
    if (typeof render === "function") dialog.addEventListener?.("render", () => render(asHtmlArg(dialog.element)));
    return dialog.render({ force: true });
  }

  return new Dialog({ title, content, buttons, default: defaultButton, close, render }).render(true);
}

async function confirmRelationshipDialog({ title, content, defaultYes = false }) {
  const DialogV2 = DialogV2Class();
  if (DialogV2) {
    return await DialogV2.confirm({
      window: { title },
      content,
      rejectClose: false,
      modal: true,
      yes: { default: defaultYes },
      no: { default: !defaultYes }
    });
  }
  return await Dialog.confirm({ title, content, defaultYes });
}

function markRelationshipDialog(html) {
  const root = html?.[0] ?? html;
  const app = root?.closest?.(".app, .window-app, .application, .window-content")?.closest?.(".app, .window-app, .application") || root?.closest?.(".window-app, .application");
  if (app) app.classList.add("relationship-map-dark-dialog");
}


async function saveBoard(b, { redraw = true } = {}) {
  const s = scene();
  if (!s) return ui.notifications.warn("Relationship Map: open a scene first.");
  await s.setFlag(MODULE_ID, FLAG_KEY, b);
  if (redraw) drawMap();
}

Hooks.once("init", () => {
  registerDefaultSettings();
});

function registerDefaultSettings() {
  // Only register the menu. The defaults themselves are intentionally not
  // registered as Foundry settings because saving many module settings from a
  // custom settings app can trigger Foundry's Configure Settings reload state.
  // They are stored in localStorage by saveDefaultsData instead.
  game.settings.registerMenu(MODULE_ID, "defaultsMenu", {
    name: "Relationship Map Defaults",
    label: "Configure Defaults",
    hint: "Set default fonts, colors, sizes, and arrow behavior for new cards and connections.",
    icon: faClass("diagram"),
    type: RelationshipMapDefaultsConfig,
    restricted: true
  });
}



async function saveDefaultsData(formData) {
  // IMPORTANT: Do not call game.settings.set for every default here.
  // In Foundry v14, repeatedly writing hidden world settings from a custom
  // settings app can cause the core Configure Settings UI to think a reload is
  // required and leave the interface in a bad state. These are only Relationship
  // Mapper defaults, so store them as one user flag object instead.
  const defaults = {
    defaultCardTint: formData.cardTint || "#f1e0b7",
    defaultCardTextColor: formData.cardTextColor || "#24180f",
    defaultCardFontFamily: formData.cardFontFamily || "Arial",
    defaultCardFontSize: Number(formData.cardFontSize || 15),
    defaultCardWidth: Number(formData.cardWidth || 180),
    defaultConnectionColor: formData.connectionColor || "#000000",
    defaultConnectionWidth: Number(formData.connectionWidth || 4),
    defaultConnectionStyle: formData.connectionStyle || "solid",
    defaultConnectionDirection: formData.connectionDirection || "from-to",
    defaultConnectionLabel: formData.connectionLabel || "",
    defaultConnectionLabelFontFamily: formData.connectionLabelFontFamily || "Arial",
    defaultConnectionLabelFontSize: Number(formData.connectionLabelFontSize || 18),
    defaultConnectionLabelColor: formData.connectionLabelColor || "#ffffff",
    defaultConnectionLabelBackground: formData.connectionLabelBackground || "#000000"
  };
  defaults.snapCardsToGrid = Boolean(formData.snapCardsToGrid);
  localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
  drawMap();
}

function defaultsConfigData() {
  return {
    cardTint: defaultCardTint(),
    cardTextColor: defaultCardTextColor(),
    cardFontFamily: defaultCardFontFamily(),
    cardFontOptions: fontOptionData(defaultCardFontFamily()),
    cardFontSize: defaultCardFontSize(),
    cardWidth: defaultCardWidth(),
    snapCardsToGrid: snapCardsToGrid(),
    connectionColor: ropeColor(),
    connectionWidth: defaultConnectionWidth(),
    connectionStyle: defaultConnectionStyle(),
    styleSolid: defaultConnectionStyle() === "solid",
    styleDashed: defaultConnectionStyle() === "dashed",
    styleDotted: defaultConnectionStyle() === "dotted",
    connectionDirection: defaultConnectionDirection(),
    connectionLabel: defaultConnectionLabel(),
    connectionLabelFontFamily: defaultConnectionLabelFontFamily(),
    connectionLabelFontOptions: fontOptionData(defaultConnectionLabelFontFamily()),
    connectionLabelFontSize: defaultConnectionLabelFontSize(),
    connectionLabelColor: defaultConnectionLabelColor(),
    connectionLabelBackground: defaultConnectionLabelBackground(),
    dirNone: defaultConnectionDirection() === "none",
    dirFromTo: defaultConnectionDirection() === "from-to",
    dirToFrom: defaultConnectionDirection() === "to-from",
    dirBoth: defaultConnectionDirection() === "both"
  };
}

let RelationshipMapDefaultsConfig;

{
  const api = foundry?.applications?.api;
  if (api?.ApplicationV2 && api?.HandlebarsApplicationMixin) {
    const { ApplicationV2, HandlebarsApplicationMixin } = api;
    RelationshipMapDefaultsConfig = class RelationshipMapDefaultsConfigV2 extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = {
        id: "relationship-map-defaults-config",
        tag: "div",
        window: { title: "Relationship Map Defaults" },
        position: { width: 520, height: "auto" }
      };

      static PARTS = {
        form: { template: `modules/${MODULE_ID}/templates/defaults-config.html` }
      };

      async _prepareContext(options) {
        return defaultsConfigData();
      }

      _onRender(context, options) {
        super._onRender?.(context, options);
        this.#activateDefaultsListeners();
      }

      activateListeners(html) {
        super.activateListeners?.(html);
        this.#activateDefaultsListeners(html?.[0] ?? html);
      }

      #activateDefaultsListeners(root = null) {
        const element = root || this.element;
        if (!element?.querySelector) return;
        const button = element.querySelector('[data-action="save-defaults"]');
        if (!button || button.dataset.rmpBound === "1") return;
        button.dataset.rmpBound = "1";
        button.addEventListener("click", async event => {
          event.preventDefault();
          event.stopPropagation();
          const form = element.querySelector('.relationship-map-defaults-config');
          if (!form) return;
          const data = Object.fromEntries(new FormData(form).entries());
          data.snapCardsToGrid = Boolean(form.querySelector('[name="snapCardsToGrid"]')?.checked);
          await saveDefaultsData(data);
          await this.close();
        });
      }
    };
  } else {
    RelationshipMapDefaultsConfig = class RelationshipMapDefaultsConfigLegacy extends Application {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: "relationship-map-defaults-config",
          title: "Relationship Map Defaults",
          template: `modules/${MODULE_ID}/templates/defaults-config.html`,
          width: 460
        });
      }

      getData() {
        return defaultsConfigData();
      }

      activateListeners(html) {
        super.activateListeners(html);
        html.find('[data-action="save-defaults"]').on('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const form = html.find('.relationship-map-defaults-config')[0];
          const data = Object.fromEntries(new FormData(form).entries());
          data.snapCardsToGrid = Boolean(form.querySelector('[name="snapCardsToGrid"]')?.checked);
          await saveDefaultsData(data);
          this.close();
        });
      }
    };
  }
}


Hooks.on("renderDialog", (_app, html) => {
  try {
    const root = html?.[0] ?? html;
    if (root?.querySelector?.(".relationship-map-dialog")) markRelationshipDialog(root);
  } catch (_err) {}
});

Hooks.on("renderRelationshipMapDefaultsConfig", (_app, html) => {
  try { markRelationshipDialog(html); } catch (_err) {}
});

function setPixiControlsEnabled(enabled) {
  for (const view of RMP.nodeViews.values()) {
    const controls = view?.__rmpControls;
    if (!controls) continue;
    controls.eventMode = enabled ? "static" : "none";
    controls.interactive = enabled;
    for (const child of controls.children ?? []) {
      child.eventMode = enabled ? "static" : "none";
      child.interactive = enabled;
      child.cursor = enabled ? (child.name === "resize" ? "nwse-resize" : "pointer") : "default";
    }
  }
}

function installPointerCaptureGuards() {
  if (RMP.pointerGuardsInstalled) return;
  RMP.pointerGuardsInstalled = true;

  const isCanvasView = ev => !!canvas?.app?.view && ev.target === canvas.app.view;

  const begin = ev => {
    if (!isCanvasView(ev)) return;
    const overControl = Boolean(RMP.controlHover);
    RMP.pointerDownOnControl = overControl;
    RMP.pointerDownOutsideControls = !overControl;

    // If the drag/pan begins anywhere other than one of our explicit card buttons,
    // make all PIXI controls non-interactive until pointerup. This prevents Foundry's
    // canvas pan from getting captured when the cursor passes over a button mid-drag.
    if (!overControl) {
      setPixiControlsEnabled(false);
      hideTooltip();
    }
  };

  const end = () => {
    RMP.pointerDownOutsideControls = false;
    RMP.pointerDownOnControl = false;
    setPixiControlsEnabled(true);
  };

  window.addEventListener("pointerdown", begin, true);
  window.addEventListener("mousedown", begin, true);
  window.addEventListener("pointerup", end, true);
  window.addEventListener("mouseup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("blur", end, true);
}

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  setupTooltip();
  installPointerCaptureGuards();
  document.getElementById("relationship-map-card-controls")?.remove?.();
  game.relationshipMapCanvasReset = {
    redraw: drawMap,
    clear: clearMap,
    addDocument: addDocumentNode,
    addToken: addTokenNode,
    addBlank: addBlankNode,
    connectFrom: id => { RMP.connectFrom = id; drawMap(); }
  };
});

Hooks.on("canvasReady", () => setupCanvasLayer());
Hooks.on("updateScene", s => { if (s?.id === scene()?.id) drawMap(); });
// Do not hide card controls on generic application renders.
// Foundry can render background apps/tooltips/sidebars while the pointer is idle,
// which made the controls vanish even though the cursor was still on the card.
// Dialog-specific calls still hide controls explicitly where needed.

Hooks.on("getActorContextOptions", (_app, opts) => addDirectoryContext(opts, game.actors, "Actor"));
Hooks.on("getItemContextOptions", (_app, opts) => addDirectoryContext(opts, game.items, "Item"));
Hooks.on("getActorDirectoryEntryContext", (_html, opts) => addDirectoryContext(opts, game.actors, "Actor"));
Hooks.on("getItemDirectoryEntryContext", (_html, opts) => addDirectoryContext(opts, game.items, "Item"));

function addDirectoryContext(opts, collection, type) {
  if (!Array.isArray(opts) || opts.some(o => (o.label || o.name) === "Create Relationship Map Node")) return;
  opts.push({
    label: "Create Relationship Map Node",
    name: "Create Relationship Map Node",
    icon: faClass("diagram"),
    visible: () => game.user?.isGM && !!scene(),
    condition: () => game.user?.isGM && !!scene(),
    onClick: async (_event, li) => {
      const doc = await resolveDocumentFromLi(li, collection);
      if (doc) await addDocumentNode(doc);
      else ui.notifications.warn(`Relationship Map: could not resolve ${type}.`);
    },
    callback: async li => {
      const doc = await resolveDocumentFromLi(li, collection);
      if (doc) await addDocumentNode(doc);
      else ui.notifications.warn(`Relationship Map: could not resolve ${type}.`);
    }
  });
}

async function resolveDocumentFromLi(li, collection) {
  const el = li instanceof HTMLElement ? li : (li?.[0] || li?.currentTarget || li?.target || li);
  if (!el) return null;
  const target = el.closest?.(".directory-item") || el.closest?.(".document") || el.closest?.("li") || el;
  const uuid = target.dataset?.uuid || target.getAttribute?.("data-uuid");
  if (uuid) return await fromUuid(uuid);
  const id = target.dataset?.documentId || target.dataset?.entryId || target.dataset?.id ||
             target.getAttribute?.("data-document-id") || target.getAttribute?.("data-entry-id") || target.getAttribute?.("data-id");
  if (!id) return null;
  const packName = target.closest?.("[data-pack]")?.dataset?.pack || target.closest?.(".compendium")?.dataset?.pack;
  if (packName) return await fromUuid(`Compendium.${packName}.${id}`);
  return collection?.get?.(id) ?? null;
}

Hooks.on("renderTokenHUD", (hud, html, data) => {
  if (!game.user?.isGM) return;
  const token = hud?.object || canvas.tokens?.get(data?._id || data?.id || data?.tokenId) || canvas.tokens?.controlled?.[0];
  const handler = async ev => {
    ev.preventDefault(); ev.stopPropagation();
    const t = hud?.object || token || canvas.tokens?.controlled?.[0];
    if (t) await addTokenNode(t);
    else ui.notifications.warn("Relationship Map: could not identify token.");
  };
  const markup = `<div class="control-icon rmp-token-hud-button" title="Create Relationship Map Node">${faIcon("diagram")}</div>`;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (root) {
    if (root.querySelector(".rmp-token-hud-button")) return;
    const tmp = document.createElement("div"); tmp.innerHTML = markup;
    const btn = tmp.firstElementChild; btn.addEventListener("click", handler);
    (root.querySelector(".col.right") || root.querySelector(".right") || root).appendChild(btn);
  } else if (html?.find) {
    if (html.find(".rmp-token-hud-button").length) return;
    const btn = $(markup); btn.on("click", handler);
    const col = html.find(".col.right"); (col.length ? col : html).append(btn);
  }
});

Hooks.on("getSceneControlButtons", controls => {
  const c = controls.find?.(x => x.name === "notes") ?? controls.find?.(x => x.name === "token") ?? controls[0];
  if (!c?.tools) return;
  if (c.tools.some(t => t.name === "relationship-map-add-blank")) return;
  c.tools.push({
    name: "relationship-map-add-blank",
    title: "Add Blank Relationship Node",
    icon: faClass("diagram"),
    visible: game.user?.isGM,
    button: true,
    onClick: () => addBlankNode()
  });
});

function setupCanvasLayer() {
  destroyCanvasLayer();
  if (!canvas?.stage) return;

  RMP.root = new PIXI.Container();
  RMP.root.name = "RelationshipMapCanvasReset";
  RMP.root.sortableChildren = true;
  RMP.root.zIndex = 10000;

  RMP.edges = new PIXI.Container();
  RMP.edges.name = "RelationshipMapEdges";
  RMP.edges.zIndex = 1;

  RMP.nodes = new PIXI.Container();
  RMP.nodes.name = "RelationshipMapNodes";
  RMP.nodes.zIndex = 2;

  RMP.ui = new PIXI.Container();
  RMP.ui.name = "RelationshipMapUI";
  RMP.ui.zIndex = 3;

  RMP.root.addChild(RMP.edges, RMP.nodes, RMP.ui);
  canvas.stage.sortableChildren = true;
  canvas.stage.addChild(RMP.root);

  if (!RMP.previewMoveBound) RMP.previewMoveBound = onPreviewMove;
  if (!RMP.previewCancelBound) RMP.previewCancelBound = onPreviewCancel;
  if (!RMP.stagePointerDownBound) RMP.stagePointerDownBound = onStagePointerDown;
  canvas.stage.on("pointerdown", RMP.stagePointerDownBound);

  drawMap();
}

function destroyCanvasLayer() {
  if (canvas?.stage && RMP.stagePointerDownBound) canvas.stage.off("pointerdown", RMP.stagePointerDownBound);
  if (RMP.root) RMP.root.destroy({ children: true });
  RMP.root = RMP.edges = RMP.nodes = RMP.ui = null;
  RMP.nodeViews.clear();
  RMP.edgeHitViews.clear();
  hideNodeControls(true);
  stopConnectionPreview();
}

function drawMap() {
  if (!canvas?.ready || !RMP.root) return;
  const b = board();
  drawEdges(b);
  drawNodes(b);
}

function viewportCenter() {
  const rect = canvas.app.view.getBoundingClientRect();
  const screen = new PIXI.Point(rect.width / 2, rect.height / 2);
  const world = canvas.stage.toLocal(screen);
  return { x: Math.round(world.x - 90), y: Math.round(world.y - 115) };
}

function nextPosition(b) {
  const center = viewportCenter();
  const i = b.nodes.length;
  return { x: center.x + (i % 3) * 36, y: center.y + (i % 3) * 36 };
}

async function addDocumentNode(doc) {
  const b = board();
  const existing = b.nodes.find(n => n.sourceUuid === doc.uuid);
  if (existing) return ui.notifications.info(`${doc.name} is already on this scene relationship map.`);
  const p = nextPosition(b);
  b.nodes.push({
    id: rid(), title: doc.name || "Untitled", img: doc.img || doc.thumbnail || "icons/svg/mystery-man.svg",
    x: p.x, y: p.y, width: defaultCardWidth(), height: Math.round(defaultCardWidth() * CARD_ASPECT),
    sourceUuid: doc.uuid, sourceType: doc.documentName || doc.constructor?.documentName || "Document",
    cardTint: defaultCardTint(), textColor: defaultCardTextColor(), fontFamily: defaultCardFontFamily(), fontSize: defaultCardFontSize()
  });
  await saveBoard(b);
}

async function addTokenNode(token) {
  const d = token.document;
  const b = board();
  const p = { x: Math.round(d.x + (d.width ?? 1) * canvas.grid.size + 30), y: Math.round(d.y) };
  b.nodes.push({
    id: rid(), title: d.name || token.name || "Token", img: d.texture?.src || token.actor?.img || "icons/svg/mystery-man.svg",
    x: p.x, y: p.y, width: defaultCardWidth(), height: Math.round(defaultCardWidth() * CARD_ASPECT),
    sourceUuid: d.uuid, sourceType: "Token", actorUuid: token.actor?.uuid,
    cardTint: defaultCardTint(), textColor: defaultCardTextColor(), fontFamily: defaultCardFontFamily(), fontSize: defaultCardFontSize()
  });
  await saveBoard(b);
}

async function addBlankNode() {
  const b = board();
  const p = nextPosition(b);
  const n = { id: rid(), title: "New Card", img: "icons/svg/mystery-man.svg", x: p.x, y: p.y, width: defaultCardWidth(), height: Math.round(defaultCardWidth() * CARD_ASPECT), sourceType: "Manual", cardTint: defaultCardTint(), textColor: defaultCardTextColor(), fontFamily: defaultCardFontFamily(), fontSize: defaultCardFontSize() };
  b.nodes.push(n);
  await saveBoard(b);
  editNode(n.id);
}

async function clearMap() {
  const ok = await confirmRelationshipDialog({ title: "Clear Relationship Map", content: "<p>Clear all relationship nodes and connections from this scene?</p>", defaultYes: false });
  if (ok) await saveBoard(emptyBoard());
}

function drawNodes(b) {
  RMP.nodes.removeChildren();
  RMP.nodeViews.clear();
  for (const n of b.nodes) {
    const view = makeNodeView(n);
    RMP.nodes.addChild(view);
    RMP.nodeViews.set(n.id, view);
  }
}

function makeClippedCardMask(w, h, cut = 7) {
  const g = new PIXI.Graphics();
  const c = Math.max(0, Math.min(Number(cut || 0), Math.floor(Math.min(w, h) / 4)));
  g.beginFill(0xffffff, 1)
    .drawPolygon([
      c, 0,
      w - c, 0,
      w, c,
      w, h - c,
      w - c, h,
      c, h,
      0, h - c,
      0, c
    ])
    .endFill();
  g.eventMode = "none";
  g.interactive = false;
  return g;
}

function makeNodeView(n) {
  const c = new PIXI.Container();
  c.name = `RMPNode.${n.id}`;
  c.x = n.x; c.y = n.y;
  c.eventMode = "static"; c.interactive = true; c.cursor = "grab";
  c.sortableChildren = true;

  const w = n.width || 180;
  const h = Math.round(w * CARD_ASPECT);
  n.height = h;
  // Make the full card rectangle the interaction target. This is important for
  // connection placement: users should be able to click anywhere on the card,
  // not just the visible edge stroke or text/image pixels.
  c.hitArea = new PIXI.Rectangle(0, 0, w, h);

  // Explicit transparent interaction plate. Relying only on Container.hitArea was
  // inconsistent across Foundry/PIXI versions, which made connection placement
  // feel like it only worked on the visible card edge. This plate makes the full
  // card rectangle a real pointer target.
  const plate = new PIXI.Graphics();
  plate.name = "interaction-plate";
  plate.beginFill(0x000000, 0.001).drawRect(0, 0, w, h).endFill();
  plate.eventMode = "static";
  plate.interactive = true;
  plate.cursor = "grab";
  plate.zIndex = 9999;
  c.addChild(plate);

  const cardLayer = new PIXI.Container();
  cardLayer.name = "card-layer";
  cardLayer.eventMode = "none";
  cardLayer.interactive = false;
  cardLayer.zIndex = 0;
  c.addChild(cardLayer);

  const card = new PIXI.Graphics();
  card.name = "card";
  card.eventMode = "none";
  drawCardGraphic(card, w, h, n.cardTint || defaultCardTint());
  cardLayer.addChild(card);
  addStonetopCardFrame(cardLayer, w, h);

  const img = new PIXI.Sprite(PIXI.Texture.from(n.img || "icons/svg/mystery-man.svg"));
  img.name = "image";
  img.eventMode = "none";
  fitSpriteInside(img, 14, 14, w - 28, Math.max(60, h - 64));
  cardLayer.addChild(img);

  const title = new PIXI.Text(n.title || "Untitled", {
    fontFamily: cardFont(n),
    fontSize: Number(n.fontSize || Math.max(12, Math.round(w * 0.082))),
    fontWeight: "bold",
    fill: isStonetopTheme() ? toNum(stonetopCardTextColor()) : (n.textColor || "#24180f"),
    align: "center",
    wordWrap: true,
    wordWrapWidth: w - 20
  });
  title.eventMode = "none";
  title.anchor.set(0.5, 1);
  title.x = w / 2;
  title.y = h - 10;
  cardLayer.addChild(title);

  // Keep the normal Stonetop card and border art, but trim only a very small
  // Battlestar-style diagonal off each finished visual corner. The interaction
  // plate and controls are left unmasked so dragging/resizing stays reliable.
  if (isStonetopTheme()) {
    const cardMask = makeClippedCardMask(w, h, 7);
    cardMask.name = "stonetop-card-corner-mask";
    c.addChild(cardMask);
    cardLayer.mask = cardMask;
  }

  addPixiControls(c, n, w, h);

  plate.on("pointerover", ev => { showPixiControls(n.id); if (n.notes) showTooltip(n.notes, ev.global?.x, ev.global?.y); });
  plate.on("pointermove", ev => { showPixiControls(n.id); if (n.notes) moveTooltip(ev.global?.x, ev.global?.y); });
  plate.on("pointerdown", ev => {
    if (RMP.connectFrom) { ev.stopPropagation(); clickConnect(n.id, ev); return; }
  });
  plate.on("pointertap", ev => {
    if (RMP.connectFrom) { ev.stopPropagation(); clickConnect(n.id, ev); return; }
  });

  c.on("pointerover", ev => { showPixiControls(n.id); if (n.notes) showTooltip(n.notes, ev.global?.x, ev.global?.y); });
  c.on("pointermove", ev => { showPixiControls(n.id); if (n.notes) moveTooltip(ev.global?.x, ev.global?.y); });
  c.on("pointerout", () => { hidePixiControls(n.id); if (n.notes) hideTooltip(); });

  c.on("pointerdown", ev => {
    if (RMP.connectFrom) {
      ev.stopPropagation();
      clickConnect(n.id, ev);
      return;
    }
    startDrag(ev, n.id);
  });
  c.on("rightdown", ev => { ev.stopPropagation(); });
  c.on("pointertap", ev => {
    if (RMP.connectFrom) { ev.stopPropagation(); clickConnect(n.id, ev); return; }
    if (ev.detail === 2) editNode(n.id);
  });

  if (RMP.connectFrom === n.id) {
    const sel = new PIXI.Graphics();
    sel.lineStyle(4, RMP.connectFromAnchor ? 0x66ccff : 0xffcc66, 0.9).drawRoundedRect(-5, -5, w + 10, h + 10, 14);
    sel.eventMode = "none";
    sel.zIndex = -1;
    c.addChild(sel);
    if (RMP.connectFromAnchor) {
      const p = pointFromAnchor(n, RMP.connectFromAnchor);
      const dot = new PIXI.Graphics();
      dot.eventMode = "none";
      // Locked origin marker uses the exact same visual language as the live preview marker:
      // black filled circle with a crisp white outline.
      dot.lineStyle(3, 0xffffff, 1)
        .beginFill(0x000000, 1)
        .drawCircle(p.x - n.x, p.y - n.y, 8)
        .endFill();
      c.addChild(dot);
    }
  }

  return c;
}

function drawCardGraphic(g, w, h, color) {
  g.clear();
  if (isStonetopTheme()) {
    g.beginFill(0xffffff, 1).drawRect(0, 0, w, h).endFill();
    g.lineStyle(1, 0x1a1a1a, 0.12).drawRect(8, 8, w - 16, h - 16);
    return;
  }
  const base = toNum(color);
  const edge = toNum(shade(color, -16));
  g.beginFill(base, 1).drawRoundedRect(0, 0, w, h, 10).endFill();
  g.lineStyle(3, edge, 0.85).drawRoundedRect(2, 2, w-4, h-4, 9);
  g.lineStyle(1, 0xffffff, 0.22).drawRoundedRect(7, 7, w-14, h-14, 7);
  g.beginFill(0x000000, 0.08).drawRoundedRect(10, 10, w-20, h-20, 6).endFill();
}

function makeStonetopFrameSprite(path, x, y, width, height) {
  const tex = PIXI.Texture.from(path);
  let sprite;
  try {
    sprite = new PIXI.TilingSprite(tex, width, height);
  } catch (_err) {
    sprite = new PIXI.Sprite(tex);
    sprite.width = width;
    sprite.height = height;
  }
  sprite.x = x;
  sprite.y = y;
  sprite.eventMode = "none";
  sprite.interactive = false;
  return sprite;
}

function addStonetopCardFrame(container, w, h) {
  if (!isStonetopTheme()) return;
  const frame = new PIXI.Container();
  frame.name = "stonetop-frame";
  frame.eventMode = "none";
  frame.interactive = false;
  frame.zIndex = 6;
  const c = 16;
  const edge = 8;
  const paths = {
    tl: stonetopAsset("panel-corner-tl.png"),
    tr: stonetopAsset("panel-corner-tr.png"),
    bl: stonetopAsset("panel-corner-bl.png"),
    br: stonetopAsset("panel-corner-br.png"),
    top: stonetopAsset("panel-edge-top.png"),
    bottom: stonetopAsset("panel-edge-bottom.png"),
    left: stonetopAsset("panel-edge-left.png"),
    right: stonetopAsset("panel-edge-right.png")
  };
  frame.addChild(makeStonetopFrameSprite(paths.top, c, 0, Math.max(1, w - c * 2), edge));
  frame.addChild(makeStonetopFrameSprite(paths.bottom, c, h - edge, Math.max(1, w - c * 2), edge));
  frame.addChild(makeStonetopFrameSprite(paths.left, 0, c, edge, Math.max(1, h - c * 2)));
  frame.addChild(makeStonetopFrameSprite(paths.right, w - edge, c, edge, Math.max(1, h - c * 2)));
  for (const [name, x, y] of [[paths.tl,0,0],[paths.tr,w-c,0],[paths.bl,0,h-c],[paths.br,w-c,h-c]]) {
    const s = new PIXI.Sprite(PIXI.Texture.from(name));
    s.x = x; s.y = y; s.width = c; s.height = c; s.eventMode = "none"; s.interactive = false;
    frame.addChild(s);
  }
  container.addChild(frame);
}



const RMP_SVG_ICON_PATHS = {
  delete: { viewBox: "0 0 448 512", path: "M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32l21.2 339c1.6 25.3 22.6 45 47.9 45h245.8c25.3 0 46.3-19.7 47.9-45L416 128z" },
  source: { viewBox: "0 0 512 512", path: "M352 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9L370.7 96 201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L416 141.3l41.4 41.4c9.2 9.2 22.9 11.9 34.9 6.9S512 173.1 512 160V32c0-17.7-14.3-32-32-32H352zM80 32C35.8 32 0 67.8 0 112v320c0 44.2 35.8 80 80 80h320c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32v112c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16h112c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z" },
  edit: { viewBox: "0 0 512 512", path: "M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0l-30.1 30.1 97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zM172.4 241.7c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160v256c0 53 43 96 96 96h256c53 0 96-43 96-96v-96c0-17.7-14.3-32-32-32s-32 14.3-32 32v96c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V160c0-17.7 14.3-32 32-32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32H96z" },
  connect: { viewBox: "0 0 640 512", path: "M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6c-41.1 57.5-34.6 136.3 15.4 186.3c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6c-31.5-31.5-31.5-82.5 0-114L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.8l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6c41.1-57.5 34.6-136.3-15.4-186.3c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z" },
  resize: { viewBox: "0 0 512 512", path: "M352 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9L370.7 96 288 178.7c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L416 141.3l41.4 41.4c9.2 9.2 22.9 11.9 34.9 6.9S512 173.1 512 160V32c0-17.7-14.3-32-32-32H352zM224 288c-12.5-12.5-32.8-12.5-45.3 0L96 370.7 54.6 329.4c-9.2-9.2-22.9-11.9-34.9-6.9S0 339.1 0 352v128c0 17.7 14.3 32 32 32h128c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9L141.3 416 224 333.3c12.5-12.5 12.5-32.8 0-45.3z" }
};

function makeSvgIconTexture(name) {
  const def = RMP_SVG_ICON_PATHS[name] ?? RMP_SVG_ICON_PATHS.edit;
  const fill = isStonetopTheme() ? "#1a1a1a" : "#f7ead0";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${def.viewBox}"><path fill="${fill}" d="${def.path}"/></svg>`;
  return PIXI.Texture.from(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function makePixiIconButton(x, y, tip, iconName, fn) {
  const c = new PIXI.Container();
  c.x = x;
  c.y = y;
  c.eventMode = "static";
  c.interactive = true;
  c.cursor = "pointer";
  c.hitArea = new PIXI.Rectangle(0, 0, 24, 24);

  const bg = new PIXI.Graphics();
  // Keep the dark fill fully inside the pale border. Drawing the fill at the
  // full 24x24 size caused a tiny dark halo to protrude around the rounded
  // corners on some renderers/zoom levels.
  if (isStonetopTheme()) {
    bg.beginFill(0xffffff, 0.95)
      .drawRoundedRect(1.5, 1.5, 21, 21, 3)
      .endFill();
    bg.lineStyle(1.5, 0x1a1a1a, 0.65)
      .drawRoundedRect(0.75, 0.75, 22.5, 22.5, 4);
  } else {
    bg.beginFill(0x17120d, 0.82)
      .drawRoundedRect(1.5, 1.5, 21, 21, 4)
      .endFill();
    bg.lineStyle(1.5, 0xf1e0b7, 0.72)
      .drawRoundedRect(0.75, 0.75, 22.5, 22.5, 5);
  }
  c.addChild(bg);

  const sprite = new PIXI.Sprite(makeSvgIconTexture(iconName));
  sprite.eventMode = "none";
  sprite.anchor.set(0.5);
  sprite.x = 12;
  sprite.y = 12;
  const target = iconName === "connect" ? 15.5 : 14.5;
  sprite.width = target;
  sprite.height = target;
  c.addChild(sprite);

  c.on("pointerover", ev => {
    RMP.controlHover = true;
    if (RMP.pointerDownOutsideControls) return;
    showPixiControls(c.__nodeId);
    showTooltip(tip, ev.global?.x, ev.global?.y);
  });
  c.on("pointermove", ev => {
    if (RMP.pointerDownOutsideControls) return;
    moveTooltip(ev.global?.x, ev.global?.y);
  });
  c.on("pointerout", () => { RMP.controlHover = false; hideTooltip(); });
  c.on("pointerdown", ev => {
    const oe = ev.data?.originalEvent;
    RMP.pointerDownOnControl = true;
    // Only consume an intentional left click. Middle/right/space canvas pan gestures are allowed through.
    if (!oe || oe.button === 0) ev.stopPropagation();
  });
  c.on("pointertap", ev => {
    if (RMP.pointerDownOutsideControls) return;
    ev.stopPropagation();
    hideTooltip();
    fn();
  });
  return c;
}

function addPixiControls(c, n, w, h) {
  const controls = new PIXI.Container();
  controls.name = "pixi-controls";
  controls.zIndex = 20000;
  controls.visible = false;
  controls.eventMode = "static";
  controls.interactive = true;

  const pad = 7;
  const gap = 4;
  const buttons = [
    makePixiIconButton(pad, pad, "Delete Card", "delete", () => deleteNode(n.id)),
    makePixiIconButton(pad + 28, pad, "Source", "source", () => openSource(n.id)),
    makePixiIconButton(pad + 56, pad, "Edit Card", "edit", () => editNode(n.id)),
    makePixiIconButton(pad + 84, pad, "Add Connection", "connect", () => clickConnect(n.id))
  ];
  for (const b of buttons) { b.__nodeId = n.id; controls.addChild(b); }

  const resize = makePixiIconButton(w - 31, h - 31, "Resize", "resize", () => {});
  resize.__nodeId = n.id;
  resize.name = "resize";
  resize.on("pointerdown", ev => {
    const oe = ev.data?.originalEvent;
    if (oe && oe.button !== 0) return;
    ev.stopPropagation();
    hideTooltip();
    startResize(ev, n.id);
  });
  controls.addChild(resize);

  controls.on("pointerover", () => { RMP.controlHover = true; if (!RMP.pointerDownOutsideControls) showPixiControls(n.id); });
  controls.on("pointerout", () => { RMP.controlHover = false; });
  c.__rmpControls = controls;
  c.addChild(controls);
}

function showPixiControls(id) {
  if (!game.user?.isGM) return;

  // While drawing a connection, card hover controls get in the way of choosing
  // source/target points. Hide and disable them entirely until the connection
  // placement workflow finishes or is canceled.
  if (RMP.connectFrom) {
    RMP.hoverNodeId = null;
    RMP.controlsNodeId = null;
    for (const [, view] of RMP.nodeViews.entries()) {
      if (!view.__rmpControls) continue;
      view.__rmpControls.visible = false;
      view.__rmpControls.eventMode = "none";
      view.__rmpControls.interactive = false;
    }
    return;
  }

  RMP.hoverNodeId = id;
  RMP.controlsNodeId = id;
  for (const [nodeId, view] of RMP.nodeViews.entries()) {
    if (!view.__rmpControls) continue;
    view.__rmpControls.eventMode = "static";
    view.__rmpControls.interactive = true;
    view.__rmpControls.visible = nodeId === id;
  }
}

function hidePixiControls(id = null) {
  if (id && RMP.hoverNodeId === id) RMP.hoverNodeId = null;
  if (id && RMP.controlsNodeId === id) RMP.controlsNodeId = null;
  for (const [nodeId, view] of RMP.nodeViews.entries()) {
    if (view.__rmpControls && (!id || nodeId === id)) view.__rmpControls.visible = false;
  }
}




// The old prototype used absolutely-positioned DOM controls. Those could capture
// pointer events during canvas panning. Controls are now PIXI children of each card,
// so these DOM-control functions are retained only as safe compatibility no-ops.
function installControlPanGuard() {}
function setupDomControls() { document.getElementById("relationship-map-card-controls")?.remove?.(); }
function showNodeControls(id) { showPixiControls(id); }
function scheduleHideNodeControls() {}
function hideNodeControls(force = false) {
  if (force) hidePixiControls();
}
function tickNodeControls() {}
function worldToClient(x, y) {
  const view = canvas?.app?.view;
  const renderer = canvas?.app?.renderer;
  if (!view || !renderer || !canvas?.stage) return { x, y };
  const rect = view.getBoundingClientRect();
  const global = canvas.stage.worldTransform.apply(new PIXI.Point(x, y));
  const screenW = renderer.screen?.width || view.width || rect.width || 1;
  const screenH = renderer.screen?.height || view.height || rect.height || 1;
  return { x: rect.left + (global.x * rect.width / screenW), y: rect.top + (global.y * rect.height / screenH) };
}

function positionNodeControls() {
  if (!RMP.controls || RMP.controls.style.display === "none" || !RMP.controlsNodeId || !canvas?.app?.view || !RMP.root) return;
  const liveBoard = RMP.dragging?.board || RMP.resizing?.board || RMP.domResizing?.board;
  const b = liveBoard || board();
  const n = b.nodes.find(x => x.id === RMP.controlsNodeId);
  if (!n) return hideNodeControls(true);

  const w = n.width || 180;
  const h = n.height || Math.round(w * CARD_ASPECT);
  const topLeft = worldToClient(n.x || 0, n.y || 0);
  const bottomRight = worldToClient((n.x || 0) + w, (n.y || 0) + h);

  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const height = Math.abs(bottomRight.y - topLeft.y);

  RMP.controls.style.left = `${Math.round(left)}px`;
  RMP.controls.style.top = `${Math.round(top)}px`;
  RMP.controls.style.width = `${Math.max(1, Math.round(width))}px`;
  RMP.controls.style.height = `${Math.max(1, Math.round(height))}px`;
}

function screenToWorld(clientX, clientY) {
  const view = canvas?.app?.view;
  const renderer = canvas?.app?.renderer;
  if (!view || !renderer || !canvas?.stage) return new PIXI.Point(clientX, clientY);

  const rect = view.getBoundingClientRect();
  const screenW = renderer.screen?.width || view.width || rect.width || 1;
  const screenH = renderer.screen?.height || view.height || rect.height || 1;
  const screen = new PIXI.Point(
    (clientX - rect.left) * screenW / rect.width,
    (clientY - rect.top) * screenH / rect.height
  );

  return canvas.stage.worldTransform.applyInverse(screen);
}

function startDomResize(ev, id) {
  if (!game.user?.isGM) return;
  const b = board();
  const n = b.nodes.find(x => x.id === id);
  if (!n) return;
  const start = screenToWorld(ev.clientX, ev.clientY);
  RMP.domResizing = { id, startX: start.x, ow: n.width || 180, board: b };
  const move = e => onDomResizeMove(e);
  const up = async e => {
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", up, true);
    const r = RMP.domResizing;
    RMP.domResizing = null;
    if (r) await saveBoard(r.board, { redraw: false });
    drawMap();
    showNodeControls(id);
  };
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", up, true);
}

function onDomResizeMove(ev) {
  const r = RMP.domResizing;
  if (!r) return;
  const pos = screenToWorld(ev.clientX, ev.clientY);
  const n = r.board.nodes.find(x => x.id === r.id);
  if (!n) return;
  applyCardSizeFromWidth(n, r.ow + pos.x - r.startX);
  drawMapLive(r.board);
  RMP.controlsNodeId = r.id;
  if (RMP.controls) RMP.controls.style.display = "flex";
  positionNodeControls();
}

function isMouseOverElement(el) {
  if (!el || !RMP.lastMouse) return false;
  const r = el.getBoundingClientRect();
  return RMP.lastMouse.x >= r.left && RMP.lastMouse.x <= r.right && RMP.lastMouse.y >= r.top && RMP.lastMouse.y <= r.bottom;
}

function isMouseOverRect(rect, pad = 0) {
  if (!rect || !RMP.lastMouse) return false;
  return RMP.lastMouse.x >= rect.left - pad && RMP.lastMouse.x <= rect.right + pad &&
         RMP.lastMouse.y >= rect.top - pad && RMP.lastMouse.y <= rect.bottom + pad;
}

function isMouseOverControlsArea() {
  if (!RMP.controls || !RMP.lastMouse || RMP.controls.style.display === "none") return false;
  // Include the card, the top button strip, the resize handle, and a small bridge/gutter between them.
  if (isMouseOverRect(RMP.controls.getBoundingClientRect(), 34)) return true;
  for (const el of RMP.controls.querySelectorAll("button, .relationship-map-card-top-controls")) {
    if (isMouseOverRect(el.getBoundingClientRect(), 10)) return true;
  }
  return false;
}


function isMouseOverCurrentCardOrControls() {
  if (!RMP.controls || !RMP.lastMouse || RMP.controls.style.display === "none") return false;
  // The controls wrapper is deliberately sized to the card bounds, so this covers
  // the card face, the in-card buttons, and the resize handle.
  return isMouseOverRect(RMP.controls.getBoundingClientRect(), 6);
}

function setupTooltip() {
  if (RMP.tooltip || !document?.body) return;
  const el = document.createElement("div");
  el.id = "relationship-map-tooltip";
  el.style.position = "fixed";
  el.style.zIndex = "100000";
  el.style.pointerEvents = "none";
  el.style.padding = "4px 7px";
  el.style.borderRadius = "4px";
  el.style.background = "rgba(20, 14, 9, 0.92)";
  el.style.color = "#f7ead0";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.2";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,.35)";
  el.style.display = "none";
  document.body.appendChild(el);
  RMP.tooltip = el;
}
function isTooltipBlockedByWindow(x, y) {
  if (x == null || y == null) return false;
  const els = document.elementsFromPoint?.(x, y) ?? [];
  return els.some(el => {
    if (!el || el === RMP.tooltip) return false;
    return Boolean(el.closest?.(".app, .application, .dialog, .window-app, .foundry-vtt-window"));
  });
}

function applyTooltipTheme() {
  if (!RMP.tooltip) return;
  if (isStonetopTheme()) {
    RMP.tooltip.style.background = "rgba(255, 255, 255, 0.96)";
    RMP.tooltip.style.color = "#1a1a1a";
    RMP.tooltip.style.border = "1px solid rgba(0,0,0,.28)";
    RMP.tooltip.style.borderRadius = "2px";
    RMP.tooltip.style.fontFamily = stonetopBodyFont();
  } else {
    RMP.tooltip.style.background = "rgba(20, 14, 9, 0.92)";
    RMP.tooltip.style.color = "#f7ead0";
    RMP.tooltip.style.border = "none";
    RMP.tooltip.style.borderRadius = "4px";
    RMP.tooltip.style.fontFamily = "";
  }
}

function showTooltip(text, x, y) {
  if (!RMP.tooltip || !text) return;
  if (isTooltipBlockedByWindow(x, y)) return hideTooltip();
  applyTooltipTheme();
  RMP.tooltip.textContent = text;
  RMP.tooltip.style.display = "block";
  moveTooltip(x, y);
}
function moveTooltip(x, y) {
  if (!RMP.tooltip || RMP.tooltip.style.display === "none") return;
  if (isTooltipBlockedByWindow(x, y)) return hideTooltip();
  RMP.tooltip.style.left = `${Math.round((x ?? 0) + 12)}px`;
  RMP.tooltip.style.top = `${Math.round((y ?? 0) + 12)}px`;
}
function hideTooltip() { if (RMP.tooltip) RMP.tooltip.style.display = "none"; }

function startDrag(ev, id) {
  if (!game.user?.isGM) return;
  if (RMP.connectFrom) return;
  if (ev.target?.name === "resize") return;
  const b = board();
  const n = b.nodes.find(x => x.id === id);
  const v = RMP.nodeViews.get(id);
  if (!n || !v) return;
  ev.stopPropagation();
  const start = ev.data?.getLocalPosition?.(RMP.root) || ev.getLocalPosition?.(RMP.root) || { x: ev.global.x, y: ev.global.y };
  RMP.dragging = { id, startX: start.x, startY: start.y, ox: n.x, oy: n.y, board: b };
  RMP.controlsNodeId = id;
  if (RMP.controls) RMP.controls.style.display = "flex";
  v.cursor = "grabbing";
  canvas.stage.on("pointermove", onDragMove);
  canvas.stage.once("pointerup", onDragEnd);
  canvas.stage.once("pointerupoutside", onDragEnd);
}

function onDragMove(ev) {
  const d = RMP.dragging;
  if (!d) return;
  const pos = ev.data?.getLocalPosition?.(RMP.root) || ev.getLocalPosition?.(RMP.root) || { x: ev.global.x, y: ev.global.y };
  const n = d.board.nodes.find(x => x.id === d.id);
  const v = RMP.nodeViews.get(d.id);
  if (!n || !v) return;
  n.x = snapValue(d.ox + pos.x - d.startX);
  n.y = snapValue(d.oy + pos.y - d.startY);
  v.x = n.x; v.y = n.y;
  if (RMP.controlsNodeId === d.id) positionNodeControls();
  drawEdges(d.board);
}

async function onDragEnd() {
  const d = RMP.dragging;
  RMP.dragging = null;
  canvas.stage.off("pointermove", onDragMove);
  canvas.stage.off("pointerup", onDragEnd);
  canvas.stage.off("pointerupoutside", onDragEnd);
  if (d) await saveBoard(d.board, { redraw: false });
  drawMap();
}

function startResize(ev, id) {
  if (!game.user?.isGM) return;
  ev.stopPropagation();
  const b = board();
  const n = b.nodes.find(x => x.id === id);
  if (!n) return;
  const start = ev.data?.getLocalPosition?.(RMP.root) || ev.getLocalPosition?.(RMP.root) || { x: ev.global.x, y: ev.global.y };
  RMP.resizing = { id, startX: start.x, ow: n.width || 180, board: b };
  canvas.stage.on("pointermove", onResizeMove);
  canvas.stage.once("pointerup", onResizeEnd);
  canvas.stage.once("pointerupoutside", onResizeEnd);
}

function onResizeMove(ev) {
  const r = RMP.resizing;
  if (!r) return;
  const pos = ev.data?.getLocalPosition?.(RMP.root) || ev.getLocalPosition?.(RMP.root) || { x: ev.global.x, y: ev.global.y };
  const n = r.board.nodes.find(x => x.id === r.id);
  if (!n) return;
  applyCardSizeFromWidth(n, r.ow + pos.x - r.startX);
  drawMapLive(r.board);
  if (RMP.controlsNodeId === r.id) positionNodeControls();
}

async function onResizeEnd() {
  const r = RMP.resizing;
  RMP.resizing = null;
  canvas.stage.off("pointermove", onResizeMove);
  canvas.stage.off("pointerup", onResizeEnd);
  canvas.stage.off("pointerupoutside", onResizeEnd);
  if (r) await saveBoard(r.board, { redraw: false });
  drawMap();
}

function drawMapLive(b) {
  drawEdges(b);
  drawNodes(b);
}

function drawEdges(b) {
  RMP.edges.removeChildren();
  RMP.edgeHitViews.clear();
  RMP.edgeCurves.clear();
  const nodes = new Map(b.nodes.map(n => [n.id, n]));
  const counts = {};
  for (const e of b.edges) counts[[e.from, e.to].sort().join("|")] = (counts[[e.from, e.to].sort().join("|")] || 0) + 1;
  const seen = {};
  for (const e of b.edges) {
    const a = nodes.get(e.from), c = nodes.get(e.to);
    if (!a || !c) continue;
    const key = [e.from, e.to].sort().join("|");
    const idx = seen[key] = (seen[key] || 0); seen[key]++;
    drawEdge(e, a, c, idx, counts[key]);
  }
  drawConnectionPreview(b);
}

function nodeRect(n) {
  const w = n.width || 180, h = n.height || Math.round(w * CARD_ASPECT);
  return { x: n.x, y: n.y, w, h, cx: n.x + w / 2, cy: n.y + h / 2 };
}
function nodeCenter(n) { const r = nodeRect(n); return { x: r.cx, y: r.cy }; }
function clamp01(v) { return Math.max(0, Math.min(1, Number(v || 0))); }

function pointFromAnchor(n, anchor) {
  const r = nodeRect(n);
  const a = anchor || { side: "right", t: 0.5 };
  const t = clamp01(a.t ?? 0.5);
  let x, y, nx, ny, tx, ty;
  if (a.side === "left") { x = r.x; y = r.y + r.h * t; nx = -1; ny = 0; tx = 0; ty = 1; }
  else if (a.side === "right") { x = r.x + r.w; y = r.y + r.h * t; nx = 1; ny = 0; tx = 0; ty = 1; }
  else if (a.side === "top") { x = r.x + r.w * t; y = r.y; nx = 0; ny = -1; tx = 1; ty = 0; }
  else { x = r.x + r.w * t; y = r.y + r.h; nx = 0; ny = 1; tx = 1; ty = 0; }
  return { x, y, nx, ny, tx, ty, side: a.side, t };
}

function closestPerimeterAnchor(n, x, y) {
  const r = nodeRect(n);
  const dxLeft = Math.abs(x - r.x);
  const dxRight = Math.abs(x - (r.x + r.w));
  const dyTop = Math.abs(y - r.y);
  const dyBottom = Math.abs(y - (r.y + r.h));
  const min = Math.min(dxLeft, dxRight, dyTop, dyBottom);
  if (min === dxLeft) return { side: "left", t: clamp01((y - r.y) / r.h) };
  if (min === dxRight) return { side: "right", t: clamp01((y - r.y) / r.h) };
  if (min === dyTop) return { side: "top", t: clamp01((x - r.x) / r.w) };
  return { side: "bottom", t: clamp01((x - r.x) / r.w) };
}

function nodeAtPoint(b, x, y, excludeId = null) {
  for (let i = b.nodes.length - 1; i >= 0; i--) {
    const n = b.nodes[i];
    if (n.id === excludeId) continue;
    const r = nodeRect(n);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return n;
  }
  return null;
}

function distanceToNodeRect(n, x, y) {
  const r = nodeRect(n);
  const dx = x < r.x ? r.x - x : (x > r.x + r.w ? x - (r.x + r.w) : 0);
  const dy = y < r.y ? r.y - y : (y > r.y + r.h ? y - (r.y + r.h) : 0);
  return Math.hypot(dx, dy);
}

function nearestNodeAtPoint(b, x, y, excludeId = null, tolerance = 180) {
  let best = null;
  let bestDist = Infinity;
  for (let i = b.nodes.length - 1; i >= 0; i--) {
    const n = b.nodes[i];
    if (n.id === excludeId) continue;
    const d = distanceToNodeRect(n, x, y);
    if (d < bestDist) { best = n; bestDist = d; }
  }
  return best && bestDist <= tolerance ? best : null;
}

function perimeterPointToward(n, target, offset = 0) {
  const r = nodeRect(n);
  const dx = target.x - r.cx;
  const dy = target.y - r.cy;
  if (!dx && !dy) return { x: r.cx, y: r.cy, nx: 0, ny: -1, tx: 1, ty: 0 };

  const halfW = r.w / 2;
  const halfH = r.h / 2;
  const scale = Math.min(halfW / Math.max(0.0001, Math.abs(dx)), halfH / Math.max(0.0001, Math.abs(dy)));
  let x = r.cx + dx * scale;
  let y = r.cy + dy * scale;

  let nx = 0, ny = 0, tx = 0, ty = 0;
  const eps = 1.5;
  if (Math.abs(x - r.x) < eps) { nx = -1; ny = 0; tx = 0; ty = 1; x = r.x; }
  else if (Math.abs(x - (r.x + r.w)) < eps) { nx = 1; ny = 0; tx = 0; ty = 1; x = r.x + r.w; }
  else if (Math.abs(y - r.y) < eps) { nx = 0; ny = -1; tx = 1; ty = 0; y = r.y; }
  else { nx = 0; ny = 1; tx = 1; ty = 0; y = r.y + r.h; }

  if (offset) {
    x += tx * offset;
    y += ty * offset;
    x = Math.max(r.x + 8, Math.min(r.x + r.w - 8, x));
    y = Math.max(r.y + 8, Math.min(r.y + r.h - 8, y));
  }
  return { x, y, nx, ny, tx, ty };
}

function bezier(a, b, idx = 0, count = 1, edge = null) {
  const ca = nodeCenter(a), cb = nodeCenter(b);
  const dx = cb.x - ca.x, dy = cb.y - ca.y, len = Math.max(80, Math.hypot(dx, dy));
  const fan = (idx - (count - 1) / 2) * 36;
  const p1 = edge?.fromAnchor ? pointFromAnchor(a, edge.fromAnchor) : perimeterPointToward(a, cb, fan);
  const p2 = edge?.toAnchor ? pointFromAnchor(b, edge.toAnchor) : perimeterPointToward(b, ca, -fan);
  const out = Math.min(190, Math.max(60, len * .24));
  const c1 = { x: p1.x + p1.nx * out, y: p1.y + p1.ny * out };
  const c2 = { x: p2.x + p2.nx * out, y: p2.y + p2.ny * out };
  return { p1, p2, c1, c2 };
}

function cubicPoint(bz,t){const m=1-t;return {x:m**3*bz.p1.x+3*m*m*t*bz.c1.x+3*m*t*t*bz.c2.x+t**3*bz.p2.x,y:m**3*bz.p1.y+3*m*m*t*bz.c1.y+3*m*t*t*bz.c2.y+t**3*bz.p2.y};}
function cubicTangent(bz,t){const m=1-t;return {x:3*m*m*(bz.c1.x-bz.p1.x)+6*m*t*(bz.c2.x-bz.c1.x)+3*t*t*(bz.p2.x-bz.c2.x),y:3*m*m*(bz.c1.y-bz.p1.y)+6*m*t*(bz.c2.y-bz.c1.y)+3*t*t*(bz.p2.y-bz.c2.y)};}

function drawBezier(g,bz,width,color,alpha=1){ drawStyledBezier(g, bz, width, color, alpha, "solid"); }

function drawStyledBezier(g, bz, width, color, alpha = 1, style = "solid") {
  style = style || "solid";
  if (style === "solid") {
    g.lineStyle(width, color, alpha);
    g.moveTo(bz.p1.x, bz.p1.y);
    g.bezierCurveTo(bz.c1.x, bz.c1.y, bz.c2.x, bz.c2.y, bz.p2.x, bz.p2.y);
    return;
  }

  const points = sampleBezier(bz, 80);
  if (style === "dotted") {
    const radius = Math.max(1.5, width / 2);
    const spacing = Math.max(width * 3.2, 10);
    drawDottedPolyline(g, points, radius, spacing, color, alpha);
    return;
  }

  const dash = Math.max(width * 4, 16);
  const gap = Math.max(width * 2.2, 8);
  drawDashedPolyline(g, points, width, dash, gap, color, alpha);
}

function sampleBezier(bz, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(cubicPoint(bz, i / steps));
  return pts;
}

function drawDashedPolyline(g, pts, width, dash, gap, color, alpha) {
  g.lineStyle(width, color, alpha);
  let draw = true, remaining = dash;
  let last = pts[0];
  if (!last) return;
  g.moveTo(last.x, last.y);
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i];
    let segLen = Math.hypot(cur.x - last.x, cur.y - last.y);
    if (!segLen) { last = cur; continue; }
    let sx = last.x, sy = last.y;
    while (segLen > 0.0001) {
      const take = Math.min(remaining, segLen);
      const t = take / segLen;
      const nx = sx + (cur.x - sx) * t;
      const ny = sy + (cur.y - sy) * t;
      if (draw) g.lineTo(nx, ny);
      else g.moveTo(nx, ny);
      sx = nx; sy = ny;
      segLen -= take;
      remaining -= take;
      if (remaining <= 0.0001) {
        draw = !draw;
        remaining = draw ? dash : gap;
        g.moveTo(sx, sy);
      }
    }
    last = cur;
  }
}

function drawDottedPolyline(g, pts, radius, spacing, color, alpha) {
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      g.beginFill(color, alpha).drawCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius).endFill();
      d += spacing;
    }
    carry = (len - (d - spacing));
    if (carry < 0) carry = 0;
  }
  // Always dot the endpoints so dotted connections feel anchored to the cards.
  const first = pts[0], last = pts[pts.length - 1];
  if (first) g.beginFill(color, alpha).drawCircle(first.x, first.y, radius).endFill();
  if (last) g.beginFill(color, alpha).drawCircle(last.x, last.y, radius).endFill();
}

function drawEdge(e,a,b,idx,count) {
  const bz = bezier(a,b,idx,count,e);
  RMP.edgeCurves.set(e.id, { edge: e, bz });
  const color = toNum(e.color || ropeColor());
  const group = new PIXI.Container();
  group.name = `RMPEdge.${e.id}`;
  group.eventMode = "static";
  group.interactive = true;
  group.cursor = "pointer";

  const w = Number(e.width || 4);
  // Plain default connection stroke: no secondary brown/rope outline.
  if (RMP.selectedEdge === e.id) {
    const selected = new PIXI.Graphics();
    drawBezier(selected, bz, w + 8, 0xffcc66, 0.45);
    group.addChild(selected);
  }
  const main = new PIXI.Graphics(); drawStyledBezier(main,bz,w,color,1,e.style || defaultConnectionStyle()); group.addChild(main);

  const hit = new PIXI.Graphics(); drawBezier(hit,bz,34,0x000000,.001); hit.eventMode="static"; hit.interactive=true; hit.cursor="pointer";
  hit.on("pointerover", ev => showTooltip("Edit Connection", ev.global?.x, ev.global?.y));
  hit.on("pointermove", ev => moveTooltip(ev.global?.x, ev.global?.y));
  hit.on("pointerout", () => hideTooltip());
  hit.on("pointertap", ev => { ev.stopPropagation(); hideTooltip(); selectEdge(e.id); editEdge(e.id); });
  hit.on("rightdown", ev => { ev.stopPropagation(); hideTooltip(); selectEdge(e.id); editEdge(e.id); });
  hit.on("pointerdown", ev => { const original = ev.data?.originalEvent ?? ev.nativeEvent ?? ev.originalEvent; if ((original?.button ?? ev.button) === 2) { ev.stopPropagation(); hideTooltip(); selectEdge(e.id); editEdge(e.id); } });
  group.addChild(hit);

  const dir = e.direction || "from-to";
  if (dir === "from-to" || dir === "both") group.addChild(makeArrow(bz,1,false,color,w));
  if (dir === "to-from" || dir === "both") group.addChild(makeArrow(bz,0,true,color,w));

  if (e.label) {
    const p = cubicPoint(bz,.5);
    const txt = new PIXI.Text(e.label, { fontFamily: edgeFont(e), fontSize:Number(e.labelFontSize||18), fill:isStonetopTheme() ? toNum(stonetopCardTextColor()) : toNum(e.labelColor || defaultConnectionLabelColor()), stroke:isStonetopTheme() ? 0xffffff : 0x000000, strokeThickness:isStonetopTheme() ? 0 : 4, align:"center" });
    txt.anchor.set(.5);
    txt.x=p.x; txt.y=p.y;
    txt.eventMode = "static";
    txt.interactive = true;
    txt.cursor = "text";
    txt.on("pointertap", ev => { if (ev.detail === 2) { ev.stopPropagation(); quickEditEdgeLabel(e.id); } });
    const bg = new PIXI.Graphics();
    bg.beginFill(isStonetopTheme() ? 0xffffff : toNum(e.labelBackground || defaultConnectionLabelBackground()), isStonetopTheme() ? 0.92 : .68).drawRoundedRect(p.x-txt.width/2-8,p.y-txt.height/2-4,txt.width+16,txt.height+8, isStonetopTheme() ? 2 : 7).endFill();
    if (isStonetopTheme()) bg.lineStyle(1, 0x1a1a1a, 0.28).drawRoundedRect(p.x-txt.width/2-8,p.y-txt.height/2-4,txt.width+16,txt.height+8,2);
    bg.eventMode = "static";
    bg.interactive = true;
    bg.cursor = "text";
    bg.on("pointertap", ev => { if (ev.detail === 2) { ev.stopPropagation(); quickEditEdgeLabel(e.id); } });
    group.addChild(bg, txt);
  }
  RMP.edges.addChild(group);
}

function makeArrow(bz,t,reverse,color,width=4) {
  const p = cubicPoint(bz,t);
  const tan = cubicTangent(bz,t);
  let angle = Math.atan2(tan.y,tan.x);
  if (reverse) angle += Math.PI;
  const size = Math.max(10, Math.min(44, Number(width || 4) * 4.5));
  const pts = [
    p.x, p.y,
    p.x - Math.cos(angle - Math.PI/6)*size, p.y - Math.sin(angle - Math.PI/6)*size,
    p.x - Math.cos(angle + Math.PI/6)*size, p.y - Math.sin(angle + Math.PI/6)*size
  ];
  const g = new PIXI.Graphics();
  g.lineStyle(Math.max(1.5, Number(width || 4) * 0.45), color, 1).beginFill(color, 1).drawPolygon(pts).endFill();
  const c = new PIXI.Container(); c.addChild(g); return c;
}

function drawCordBands(group, bz, width, color) {
  const count = 9;
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = cubicPoint(bz, t);
    const tan = cubicTangent(bz, t);
    const angle = Math.atan2(tan.y, tan.x) + Math.PI / 2;
    const len = Math.max(5, width * 0.8);
    const g = new PIXI.Graphics();
    g.lineStyle(1.2, color, 0.35);
    g.moveTo(p.x - Math.cos(angle) * len, p.y - Math.sin(angle) * len);
    g.lineTo(p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
    group.addChild(g);
  }
}

function onStagePointerDown(ev) {
  const original = ev.data?.originalEvent ?? ev.nativeEvent ?? ev.originalEvent;
  const button = original?.button ?? ev.button;
  const pos = ev.data?.getLocalPosition?.(RMP.root) || ev.getLocalPosition?.(RMP.root) || { x: ev.global?.x, y: ev.global?.y };

  // During connection placement, a click near a card projects onto that card's nearest edge.
  // The user does not need to click directly on the card border.
  if (button === 0 && RMP.connectFrom) {
    const b = board();
    if (!RMP.connectFromAnchor) {
      const source = b.nodes.find(n => n.id === RMP.connectFrom);
      if (source) {
        ev.stopPropagation?.();
        const anchor = closestPerimeterAnchor(source, pos.x, pos.y);
        RMP.connectFromAnchor = anchor;
        const p = pointFromAnchor(source, anchor);
        RMP.previewPoint = { x: p.x, y: p.y, nodeId: source.id, anchor };
        drawMap();
        ui.notifications.info("Relationship Map: now click near the target card; it will snap to the nearest edge.");
      }
      return;
    }
    const hit = nearestNodeAtPoint(b, pos.x, pos.y, RMP.connectFrom, 260);
    if (hit) {
      ev.stopPropagation?.();
      clickConnect(hit.id, ev);
    }
    return;
  }

  if (button !== 2) return;
  const id = findEdgeAtPoint(pos.x, pos.y);
  if (!id) return;
  ev.stopPropagation?.();
  hideTooltip();
  selectEdge(id);
  editEdge(id);
}

function findEdgeAtPoint(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, data] of RMP.edgeCurves.entries()) {
    const d = distanceToBezier(x, y, data.bz);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return bestDist <= 22 ? best : null;
}

function distanceToBezier(x, y, bz) {
  let best = Infinity;
  let prev = cubicPoint(bz, 0);
  for (let i = 1; i <= 40; i++) {
    const p = cubicPoint(bz, i / 40);
    best = Math.min(best, distanceToSegment(x, y, prev.x, prev.y, p.x, p.y));
    prev = p;
  }
  return best;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (!dx && !dy) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const x = x1 + t * dx, y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function eventWorldPoint(ev) {
  if (ev?.data?.getLocalPosition && RMP.root) return ev.data.getLocalPosition(RMP.root);
  if (ev?.getLocalPosition && RMP.root) return ev.getLocalPosition(RMP.root);
  if (ev?.global && RMP.root?.worldTransform) return RMP.root.worldTransform.applyInverse(ev.global);
  return { x: ev?.global?.x ?? 0, y: ev?.global?.y ?? 0 };
}

function clickConnect(id, ev = null) {
  const b = board();
  const clicked = b.nodes.find(n => n.id === id);

  if (!RMP.connectFrom) {
    RMP.connectFrom = id;
    RMP.connectFromAnchor = null;
    hidePixiControls();
    hideTooltip();
    startConnectionPreview();
    drawMap();
    ui.notifications.info("Relationship Map: click near the source card to place the origin; it will snap to the nearest edge.");
    return;
  }

  if (RMP.connectFrom === id) {
    if (ev && clicked) {
      const raw = eventWorldPoint(ev);
      RMP.connectFromAnchor = closestPerimeterAnchor(clicked, raw.x, raw.y);
      const p = pointFromAnchor(clicked, RMP.connectFromAnchor);
      RMP.previewPoint = { x: p.x, y: p.y, nodeId: clicked.id, anchor: RMP.connectFromAnchor };
      drawMap();
      ui.notifications.info("Relationship Map: now click near the target card; it will snap to the nearest edge.");
      return;
    }
    RMP.connectFrom = null;
    RMP.connectFromAnchor = null;
    RMP.redrawEdgeId = null;
    stopConnectionPreview();
    drawMap();
    return;
  }

  if (!RMP.connectFromAnchor) {
    ui.notifications.warn("Relationship Map: click the source card first, then click the target card.");
    return;
  }

  if (!clicked) return;
  const raw = ev ? eventWorldPoint(ev) : (RMP.previewPoint || nodeCenter(clicked));
  const targetAnchor = closestPerimeterAnchor(clicked, raw.x, raw.y);
  const targetPoint = pointFromAnchor(clicked, targetAnchor);
  Promise.resolve(createEdge(RMP.connectFrom, id, { x: targetPoint.x, y: targetPoint.y, nodeId: id, anchor: targetAnchor }))
    .catch(err => {
      console.error("Relationship Map | Failed to create connection", err);
      ui.notifications.error("Relationship Map: failed to create connection. Check the console for details.");
    });
  RMP.connectFrom = null;
  RMP.connectFromAnchor = null;
  RMP.redrawEdgeId = null;
  stopConnectionPreview();
}

function startConnectionPreview() {
  if (!canvas?.stage || !RMP.previewMoveBound) return;
  RMP.previewPoint = null;
  canvas.stage.on("pointermove", RMP.previewMoveBound);
  canvas.stage.on("rightdown", RMP.previewCancelBound);
}
function stopConnectionPreview() {
  RMP.previewPoint = null;
  if (canvas?.stage && RMP.previewMoveBound) canvas.stage.off("pointermove", RMP.previewMoveBound);
  if (canvas?.stage && RMP.previewCancelBound) canvas.stage.off("rightdown", RMP.previewCancelBound);
}
function onPreviewMove(ev) {
  if (!RMP.connectFrom || !RMP.root) return;
  const b = board();
  const raw = eventWorldPoint(ev);

  if (!RMP.connectFromAnchor) {
    const source = b.nodes.find(n => n.id === RMP.connectFrom);
    if (source) {
      const anchor = closestPerimeterAnchor(source, raw.x, raw.y);
      const p = pointFromAnchor(source, anchor);
      RMP.previewPoint = { x: p.x, y: p.y, nodeId: source.id, anchor, sourcePreview: true };
    }
    drawEdges(b);
    return;
  }

  const hit = nearestNodeAtPoint(b, raw.x, raw.y, RMP.connectFrom, 260);
  if (hit) {
    const anchor = closestPerimeterAnchor(hit, raw.x, raw.y);
    const p = pointFromAnchor(hit, anchor);
    RMP.previewPoint = { x: p.x, y: p.y, nodeId: hit.id, anchor };
  } else {
    RMP.previewPoint = raw;
  }
  drawEdges(b);
}
function onPreviewCancel(ev) {
  if (!RMP.connectFrom) return;
  ev.stopPropagation?.();
  RMP.connectFrom = null;
  RMP.connectFromAnchor = null;
  RMP.redrawEdgeId = null;
  stopConnectionPreview();
  drawMap();
}
function drawConnectionPreview(b) {
  if (!RMP.connectFrom || !RMP.previewPoint) return;
  const from = b.nodes.find(n => n.id === RMP.connectFrom);
  if (!from) return;

  const group = new PIXI.Container();
  // Preview endpoint markers are always the same simple black-outlined circle.
  // They deliberately ignore the connection color/defaults so the placement UI
  // stays visually consistent and does not pick up old rope/brown settings.
  const previewColor = 0x000000;

  const drawEndpointMarker = (x, y) => {
    const g = new PIXI.Graphics();
    // Placement marker: black circle with a crisp white outline.
    g.lineStyle(3, 0xffffff, 1)
      .beginFill(0x000000, 1)
      .drawCircle(x, y, 8)
      .endFill();
    group.addChild(g);
  };

  const sourceAnchor = RMP.connectFromAnchor || RMP.previewPoint.anchor || closestPerimeterAnchor(from, RMP.previewPoint.x, RMP.previewPoint.y);
  const sourcePoint = pointFromAnchor(from, sourceAnchor);

  // While choosing the origin, show only the snapped endpoint marker.
  if (!RMP.connectFromAnchor) {
    drawEndpointMarker(sourcePoint.x, sourcePoint.y);
    RMP.edges.addChild(group);
    return;
  }

  // While choosing the termination point, show the same endpoint marker style at both ends.
  // Do not draw arrows in preview mode; arrows only appear once the connection is finalized.
  const targetPoint = { x: RMP.previewPoint.x, y: RMP.previewPoint.y };
  const temp = { id:"__preview", x:targetPoint.x - 1, y:targetPoint.y - 1, width:2, height:2 };
  const fakeEdge = { fromAnchor: RMP.connectFromAnchor };
  const bz = bezier(from, temp, 0, 1, fakeEdge);
  bz.p2 = { x: targetPoint.x, y: targetPoint.y, nx: 0, ny: 0, tx: 1, ty: 0 };
  bz.c2 = { x: targetPoint.x, y: targetPoint.y };

  const shadow = new PIXI.Graphics();
  // No outline/shadow in preview; keep the line plain black.

  const main = new PIXI.Graphics();
  drawBezier(main, bz, 4, 0x000000, .85);
  group.addChild(main);

  drawEndpointMarker(sourcePoint.x, sourcePoint.y);
  drawEndpointMarker(targetPoint.x, targetPoint.y);

  RMP.edges.addChild(group);
}

async function createEdge(from, to, targetPoint = null) {
  const b = board();
  const a = b.nodes.find(n => n.id === from);
  const c = b.nodes.find(n => n.id === to);
  const tp = targetPoint || (c ? nodeCenter(c) : null);
  let e = RMP.redrawEdgeId ? b.edges.find(x => x.id === RMP.redrawEdgeId) : null;
  const isRedraw = !!e;
  if (!e) {
    e = {
      id: rid(), from, to, label: defaultConnectionLabel() || "Connection", color: (defaultConnectionColor() || "#000000"), width: defaultConnectionWidth(), direction: defaultConnectionDirection(),
      style: defaultConnectionStyle(), labelFontFamily: defaultConnectionLabelFontFamily(), labelFontSize: defaultConnectionLabelFontSize(), labelColor: defaultConnectionLabelColor(), labelBackground: defaultConnectionLabelBackground()
    };
  } else {
    e.from = from;
    e.to = to;
  }
  if (a) e.fromAnchor = RMP.connectFromAnchor || (tp ? closestPerimeterAnchor(a, tp.x, tp.y) : closestPerimeterAnchor(a, nodeCenter(c).x, nodeCenter(c).y));
  if (c && targetPoint?.anchor) e.toAnchor = targetPoint.anchor;
  else if (c && tp) e.toAnchor = closestPerimeterAnchor(c, tp.x, tp.y);
  if (!isRedraw) b.edges.push(e);
  RMP.redrawEdgeId = null;
  await saveBoard(b);
  editEdge(e.id);
}

function selectEdge(id) {
  RMP.selectedEdge = id;
  drawEdges(board());
}

async function quickEditEdgeLabel(id) {
  const b = board();
  const e = b.edges.find(x => x.id === id);
  if (!e) return;
  const content = `<form class="relationship-map-dialog">
    <div class="form-group"><label>Connection Label</label><input type="text" name="label" value="${esc(e.label || "")}" autofocus></div>
  </form>`;
  hideNodeControls(true);
  renderRelationshipDialog({
    title: "Edit Connection Label",
    content,
    buttons: {
      save: { label: "Save", icon: faIcon("save"), callback: async html => { const f = html[0].querySelector("form"); e.label = f.label.value || ""; await saveBoard(b); } },
      cancel: { label: "Cancel" }
    },
    defaultButton: "save",
    render: html => { setTimeout(() => html[0]?.querySelector?.("input[name=label]")?.focus?.(), 50); }
  });
}

async function editEdge(id) {
  RMP.selectedEdge = id;
  drawEdges(board());
  const b=board(); const e=b.edges.find(x=>x.id===id); if(!e)return;
  const a=b.nodes.find(n=>n.id===e.from)?.title||"A", c=b.nodes.find(n=>n.id===e.to)?.title||"B";
  const content=`<form class="relationship-map-dialog">
    <div class="form-group"><label>Label</label><input type="text" name="label" value="${esc(e.label)}"></div>
    <div class="form-group"><label>Label Font</label>${fontSelectHtml("labelFontFamily", e.labelFontFamily || "Arial")}</div>
    <div class="form-group"><label>Label Font Size</label><input type="number" name="labelFontSize" min="8" max="72" value="${Number(e.labelFontSize || 18)}"></div>
    <div class="form-group"><label>Label Text Color</label><input type="color" name="labelColor" value="${e.labelColor || defaultConnectionLabelColor()}"></div>
    <div class="form-group"><label>Label Background</label><input type="color" name="labelBackground" value="${e.labelBackground || defaultConnectionLabelBackground()}"></div>
    <div class="form-group"><label>Color</label><input type="color" name="color" value="${e.color||ropeColor()}"></div>
    <div class="form-group"><label>Width</label>${rangeHtml("width", Number(e.width || 4), { min: 1, max: 30, step: 1 })}</div>
    <div class="form-group"><label>Line Style</label><select name="style">
      <option value="solid" ${!e.style||e.style==="solid"?"selected":""}>Solid</option>
      <option value="dashed" ${e.style==="dashed"?"selected":""}>Dashed</option>
      <option value="dotted" ${e.style==="dotted"?"selected":""}>Dotted</option>
    </select></div>
    <div class="form-group"><label>Direction</label><select name="direction">
      <option value="none" ${e.direction==="none"?"selected":""}>No arrows</option>
      <option value="from-to" ${!e.direction||e.direction==="from-to"?"selected":""}>${esc(a)} → ${esc(c)}</option>
      <option value="to-from" ${e.direction==="to-from"?"selected":""}>${esc(c)} → ${esc(a)}</option>
      <option value="both" ${e.direction==="both"?"selected":""}>${esc(a)} ↔ ${esc(c)}</option>
    </select></div>
  </form>`;
  hideNodeControls(true);
  const clearConnectionHighlight = () => {
    if (RMP.selectedEdge === id) {
      RMP.selectedEdge = null;
      drawEdges(board());
    }
  };
  renderRelationshipDialog({title:`Edit Connection: ${a} ↔ ${c}`,content,buttons:{
    save:{label:"Save",icon: faIcon("save"),callback:async html=>{const f=html[0].querySelector("form");e.label=f.label.value;e.labelFontFamily=f.labelFontFamily.value||"Arial";e.labelFontSize=Number(f.labelFontSize.value||18);e.labelColor=f.labelColor.value||defaultConnectionLabelColor();e.labelBackground=f.labelBackground.value||defaultConnectionLabelBackground();e.color=f.color.value;e.width=Number(f.width.value||4);e.style=f.style.value||"solid";e.direction=f.direction.value;RMP.selectedEdge=null;await saveBoard(b);}},
    redraw:{label:"Redraw Endpoints",icon: faIcon("connect"),callback:()=>{ startRedrawEdge(id); }},
    del:{label:"Delete",icon: faIcon("delete"),callback:async()=>{b.edges=b.edges.filter(x=>x.id!==id);RMP.selectedEdge=null;await saveBoard(b);}},
    cancel:{label:"Cancel", callback: clearConnectionHighlight}
  },defaultButton:"save", close: clearConnectionHighlight});
}

function startRedrawEdge(id) {
  const b = board();
  const e = b.edges.find(x => x.id === id);
  if (!e) return ui.notifications.warn("Relationship Map: could not find that connection.");
  RMP.selectedEdge = id;
  RMP.redrawEdgeId = id;
  RMP.connectFrom = e.from;
  RMP.connectFromAnchor = null;
  startConnectionPreview();
  drawMap();
  ui.notifications.info("Relationship Map: click near the source card, then near the target card, to redraw this connection.");
}

async function editNode(id) {
  const b=board(); const n=b.nodes.find(x=>x.id===id); if(!n)return;
  const content=`<form class="relationship-map-dialog">
    <div class="form-group"><label>Title</label><input type="text" name="title" value="${esc(n.title)}"></div>
    <div class="form-group"><label>Image Path</label><input type="text" name="img" value="${esc(n.img)}"></div>
    <div class="form-group"><label>Notes Tooltip</label><textarea name="notes" rows="4" style="width:100%;resize:vertical;">${esc(n.notes || "")}</textarea></div>
    <div class="form-group"><label>Card Tint</label><input type="color" name="cardTint" value="${n.cardTint||'#f1e0b7'}"></div>
    <div class="form-group"><label>Text Color</label><input type="color" name="textColor" value="${n.textColor||'#24180f'}"></div>
    <div class="form-group"><label>Card Font</label>${fontSelectHtml("fontFamily", n.fontFamily || "Arial")}</div>
    <div class="form-group"><label>Card Font Size</label><input type="number" name="fontSize" min="8" max="72" value="${Number(n.fontSize || Math.max(12, Math.round((n.width || 180) * 0.082)))}"></div>
  </form>`;
  hideNodeControls(true);
  renderRelationshipDialog({title:"Edit Relationship Node",content,buttons:{
    save:{label:"Save",icon: faIcon("save"),callback:async html=>{const f=html[0].querySelector("form");n.title=f.title.value;n.img=f.img.value;n.notes=f.notes.value;n.cardTint=f.cardTint.value;n.textColor=f.textColor.value;n.fontFamily=f.fontFamily.value||"Arial";n.fontSize=Number(f.fontSize.value||15);await saveBoard(b);}},
    cancel:{label:"Cancel"}
  },defaultButton:"save"});
}

function openNodeMenu(id) {
  const n=board().nodes.find(x=>x.id===id); if(!n)return;
  renderRelationshipDialog({title:n.title||"Relationship Node",content:"<p>What do you want to do?</p>",buttons:{
    connect:{label:"Start Connection",icon: faIcon("connect"),callback:()=>clickConnect(id)},
    connections:{label:"Edit Connections",icon: faIcon("diagram"),callback:()=>chooseEdgeForNode(id)},
    edit:{label:"Edit Card",icon: faIcon("edit"),callback:()=>editNode(id)},
    open:{label:"Open Source",icon: faIcon("source"),callback:()=>openSource(id)},
    del:{label:"Delete",icon: faIcon("delete"),callback:()=>deleteNode(id)}
  }});
}

function chooseEdgeForNode(id) {
  const b = board();
  const related = b.edges.filter(e => e.from === id || e.to === id);
  const nodeName = nid => b.nodes.find(n => n.id === nid)?.title || "Untitled";
  if (!related.length) return ui.notifications.info("Relationship Map: this card has no connections yet.");
  const options = related.map(e => {
    const a = nodeName(e.from), c = nodeName(e.to);
    const label = e.label ? ` — ${esc(e.label)}` : "";
    return `<option value="${e.id}">${esc(a)} ↔ ${esc(c)}${label}</option>`;
  }).join("");
  const content = `<form class="relationship-map-dialog">
    <div class="form-group"><label>Connection</label><select name="edgeId">${options}</select></div>
  </form>`;
  renderRelationshipDialog({title:"Edit Connection",content,buttons:{
    edit:{label:"Edit",icon: faIcon("edit"),callback:html=>{const edgeId=html[0].querySelector("select[name=edgeId]").value; editEdge(edgeId);}},
    cancel:{label:"Cancel"}
  },defaultButton:"edit"});
}

async function deleteNode(id){
  const ok=await confirmRelationshipDialog({title:"Delete Relationship Node",content:"<p>Delete this card and all connected relationships?</p>",defaultYes:false});
  if(!ok)return;
  const b=board(); b.nodes=b.nodes.filter(n=>n.id!==id); b.edges=b.edges.filter(e=>e.from!==id&&e.to!==id); await saveBoard(b);
}

async function openSource(id){
  const n=board().nodes.find(x=>x.id===id); const uuid=n?.actorUuid||n?.sourceUuid; if(!uuid)return;
  const doc=await fromUuid(uuid); doc?.sheet?.render?.(true);
}

function shade(hex,pct){
  const c=String(hex||"#f1e0b7").replace("#","");
  const n=parseInt(c.length===3?c.split("").map(x=>x+x).join(""):c,16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255; const f=v=>Math.max(0,Math.min(255,Math.round(v+(pct/100)*255)));
  return `#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}
