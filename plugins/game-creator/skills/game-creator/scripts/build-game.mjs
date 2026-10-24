#!/usr/bin/env node
// build-game.mjs — create a complete TCG Sandbox game from one declarative spec.
//
//   node build-game.mjs <spec.json> [--dry-run]
//
// --dry-run validates the spec (and that every stock image slug exists) without writing anything.
// The spec format is documented in ../references/game-spec.md; ../examples/ holds complete specs.
// Credentials and target come from the same env vars as tcg.mjs.
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { API_BASE, request } from './tcg.mjs';

const GRID = 6; // the board is always 6 columns x 6 rows
const MAX_PRESET_CARDS = 500;
const ATTRIBUTE_TYPES = ['string', 'number', 'boolean'];
const SLOT_TYPES = ['cards', 'counters', 'preset_cards'];
const PRESET_MODES = ['ordered', 'shuffled', 'random'];
const DEFAULT_MAX_COUNT = { cards: 10, counters: 5, preset_cards: 1 };
const WEB_BASE = (process.env.TCG_SANDBOX_WEB ?? 'https://tcg-sandbox.com').replace(/\/$/, '');
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const [specPath, ...flags] = process.argv.slice(2);
if (!specPath) {
  console.error('usage: node build-game.mjs <spec.json> [--dry-run]');
  process.exit(2);
}
const dryRun = flags.includes('--dry-run');
const specDir = dirname(resolve(specPath));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

/* ---------------------------------------------------------------- validation */

const errors = [];
const fail = (message) => errors.push(message);
const typeOf = (value) => (typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string');

function validate() {
  if (!spec.name?.trim()) fail('name is required');
  else if (!/^[a-zA-Z0-9\-_ $@]+$/.test(spec.name)) {
    fail(`name "${spec.name}" may only use letters, digits, spaces, "-", "_", "$" and "@" (no "&", apostrophes or other punctuation)`);
  }
  if (!spec.description?.trim()) fail('description is required');

  const sets = spec.sets ?? [];
  if (sets[0]?.id !== 'base') fail('sets[0] must be the base set: { "id": "base", ... }');
  const setIds = new Set();
  for (const set of sets) {
    if (!/^[a-z0-9-]+$/.test(set.id ?? '')) fail(`set id "${set.id}" must be lowercase letters, digits and dashes`);
    if (setIds.has(set.id)) fail(`set id "${set.id}" is used twice`);
    setIds.add(set.id);
    for (const [attr, type] of Object.entries(set.attributes ?? {})) {
      if (!ATTRIBUTE_TYPES.includes(type)) fail(`set "${set.id}": attribute "${attr}" has type "${type}"; use ${ATTRIBUTE_TYPES.join(' | ')}`);
    }
    const names = new Set();
    for (const card of set.cards ?? []) {
      if (!card.name?.trim()) fail(`set "${set.id}": a card has no name`);
      if (names.has(card.name)) fail(`set "${set.id}": card name "${card.name}" is used twice`);
      names.add(card.name);
      for (const [attr, value] of Object.entries(card.attributes ?? {})) {
        const declared = set.attributes?.[attr];
        if (!declared) fail(`card "${card.name}": attribute "${attr}" isn't declared on set "${set.id}"`);
        else if (typeOf(value) !== declared) fail(`card "${card.name}": "${attr}" should be a ${declared}, got ${JSON.stringify(value)}`);
      }
      if (card.image && !card.image.stockSlug && !card.image.file) fail(`card "${card.name}": image needs stockSlug or file`);
    }
  }
  if (!sets.some((set) => set.cards?.length)) fail('a game needs at least one card to be playable');

  const decksOff = spec.options?.playerDecksEnabled === false;
  if (decksOff && spec.premadeDecks?.length) fail('premadeDecks are not allowed when options.playerDecksEnabled is false');
  for (const deck of spec.premadeDecks ?? []) {
    if (!deck.displayName?.trim()) fail('every premade deck needs a displayName');
    if (!deck.cards?.length) fail(`premade deck "${deck.displayName}" has no cards`);
    deck.cards?.forEach((ref) => resolveRefs([ref], `premade deck "${deck.displayName}"`));
  }

  const board = spec.board;
  if (!board) {
    fail('board is required to make the game playable');
    return;
  }
  if (!(board.playerCount >= 1 && board.playerCount <= 4)) fail('board.playerCount must be 1 to 4');
  const occupied = new Map();
  (board.slots ?? []).forEach((raw, index) => {
    const slot = normalizeSlot(raw);
    const label = `slot ${index}${slot.name ? ` ("${slot.name}")` : ''}`;
    if (!SLOT_TYPES.includes(slot.type)) fail(`${label}: type must be ${SLOT_TYPES.join(' | ')}`);
    if (slot.name && slot.name.length > 32) fail(`${label}: name is longer than 32 characters`);
    if (slot.row < 0 || slot.column < 0 || slot.width < 1 || slot.height < 1 ||
      slot.row + slot.height > GRID || slot.column + slot.width > GRID) {
      fail(`${label}: must fit the ${GRID}x${GRID} grid (row + height <= ${GRID}, column + width <= ${GRID})`);
    }
    if (slot.playerOwner !== null && !(slot.playerOwner >= 1 && slot.playerOwner <= board.playerCount)) {
      fail(`${label}: playerOwner must be null or 1..playerCount`);
    }
    for (let r = slot.row; r < slot.row + slot.height; r++) {
      for (let c = slot.column; c < slot.column + slot.width; c++) {
        const other = occupied.get(`${r},${c}`);
        if (other !== undefined) fail(`${label} overlaps slot ${other} at row ${r}, column ${c}`);
        occupied.set(`${r},${c}`, index);
      }
    }
    const preset = raw.presetCards;
    if (slot.type === 'preset_cards') {
      if (!preset) fail(`${label}: a preset_cards slot needs presetCards`);
      else {
        if (!PRESET_MODES.includes(preset.mode)) fail(`${label}: presetCards.mode must be ${PRESET_MODES.join(' | ')}`);
        if (preset.mode === 'random' && !(preset.count >= 1)) fail(`${label}: random mode needs a count`);
        const cards = resolveRefs(preset.cards ?? [], label);
        if (!cards.length) fail(`${label}: presetCards.cards is empty`);
        const dealt = preset.mode === 'random' ? preset.count : cards.reduce((sum, c) => sum + c.quantity, 0);
        if (dealt > MAX_PRESET_CARDS) fail(`${label}: deals ${dealt} cards; the limit is ${MAX_PRESET_CARDS}`);
      }
    } else if (preset) {
      fail(`${label}: presetCards only belongs on a preset_cards slot`);
    }
  });
}

function normalizeSlot(raw) {
  const type = raw.type ?? 'cards';
  return {
    name: raw.name,
    row: raw.row,
    column: raw.column,
    width: raw.width ?? 1,
    height: raw.height ?? 1,
    type,
    maxCount: raw.maxCount ?? DEFAULT_MAX_COUNT[type] ?? 10,
    visibility: raw.visibility ?? 'public',
    playerOwner: raw.playerOwner ?? null,
  };
}

/**
 * Card references → { setId, name, quantity }. A reference is { "card": "<name>", "quantity"?, "set"? }
 * or { "set": "<id>", "quantity"? } for one of every card in a set.
 */
function resolveRefs(refs, where) {
  const out = [];
  for (const ref of refs) {
    const quantity = ref.quantity ?? 1;
    if (!(Number.isInteger(quantity) && quantity >= 1)) fail(`${where}: quantity must be a whole number >= 1`);
    if (ref.card) {
      const matches = (spec.sets ?? [])
        .filter((set) => !ref.set || set.id === ref.set)
        .flatMap((set) => (set.cards ?? []).filter((card) => card.name === ref.card).map(() => set.id));
      if (matches.length === 0) fail(`${where}: no card named "${ref.card}"${ref.set ? ` in set "${ref.set}"` : ''}`);
      else if (matches.length > 1) fail(`${where}: "${ref.card}" is in several sets; add "set"`);
      else out.push({ setId: matches[0], name: ref.card, quantity });
    } else if (ref.set) {
      const set = (spec.sets ?? []).find((s) => s.id === ref.set);
      if (!set) fail(`${where}: no set "${ref.set}"`);
      else (set.cards ?? []).forEach((card) => out.push({ setId: set.id, name: card.name, quantity }));
    } else {
      fail(`${where}: each card reference needs "card" or "set"`);
    }
  }
  return out;
}

async function checkStockSlugs() {
  const want = { banners: new Set(), cards: new Set() };
  if (spec.banner?.stockSlug) want.banners.add(spec.banner.stockSlug);
  (spec.sets ?? []).flatMap((set) => set.cards ?? []).forEach((card) => {
    if (card.image?.stockSlug) want.cards.add(card.image.stockSlug);
  });
  for (const [kind, slugs] of Object.entries(want)) {
    if (!slugs.size) continue;
    const catalog = await request('GET', `/images/stock?kind=${kind}`, undefined, { auth: false });
    const known = new Set(catalog.images.map((image) => image.slug));
    slugs.forEach((slug) => { if (!known.has(slug)) fail(`stock ${kind} image "${slug}" doesn't exist (GET /images/stock?kind=${kind})`); });
  }
}

/* ---------------------------------------------------------------- build */

function dataUrl(file) {
  const path = resolve(specDir, file);
  const type = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!type) throw new Error(`unsupported image type: ${file}`);
  return `data:${type};base64,${readFileSync(path).toString('base64')}`;
}

function imageFields(image) {
  if (!image) return {};
  return image.stockSlug ? { cardStockSlug: image.stockSlug } : { cardImage: dataUrl(image.file) };
}

function textOrFile(value) {
  return typeof value === 'object' && value?.file ? readFileSync(resolve(specDir, value.file), 'utf8') : value;
}

async function build() {
  const [base, ...extraSets] = spec.sets;
  const game = await request('POST', '/games', {
    name: spec.name,
    description: spec.description,
    bannerVerticalAlignment: spec.bannerVerticalAlignment ?? 50,
    attributes: base.attributes ?? {},
    ...(spec.banner?.stockSlug ? { bannerStockSlug: spec.banner.stockSlug } : {}),
    ...(spec.banner?.file ? { bannerImage: dataUrl(spec.banner.file) } : {}),
  });
  console.error(`created game ${game.id}; if a later step fails, fix the spec and DELETE /games/${game.id} before rerunning`);

  for (const set of extraSets) {
    await request('POST', `/games/${game.id}/sets`, {
      setId: set.id,
      displayName: set.displayName ?? set.id,
      description: set.description ?? '',
      attributes: set.attributes ?? {},
    });
  }

  const cardIds = new Map(); // "<setId>/<name>" → card id
  for (const set of spec.sets) {
    for (const card of set.cards ?? []) {
      const created = await request('POST', `/games/${game.id}/sets/${set.id}/cards`, {
        name: card.name,
        description: card.description ?? '',
        attributes: card.attributes ?? {},
        ...imageFields(card.image),
      });
      cardIds.set(`${set.id}/${card.name}`, created.id);
    }
    console.error(`set ${set.id}: ${(set.cards ?? []).length} cards`);
  }
  const componentCards = (refs) => resolveRefs(refs, '').map((ref) => ({
    cardId: cardIds.get(`${ref.setId}/${ref.name}`), setId: ref.setId, quantity: ref.quantity,
  }));

  // Board last: the server decides `playable` when the board is saved, and that needs the cards.
  const updated = await request('PUT', `/games/${game.id}`, {
    ...(spec.options ? { options: spec.options } : {}),
    ...(spec.rules ? { rules: textOrFile(spec.rules) } : {}),
    ...(spec.designNotes ? { designNotes: spec.designNotes } : {}),
    gamePlayData: {
      playerCount: spec.board.playerCount,
      slots: spec.board.slots.map((raw) => ({
        ...normalizeSlot(raw),
        ...(raw.presetCards ? {
          presetCards: {
            mode: raw.presetCards.mode,
            cards: componentCards(raw.presetCards.cards),
            count: raw.presetCards.mode === 'random' ? raw.presetCards.count : null,
            topCardVisible: raw.presetCards.topCardVisible ?? false,
          },
        } : {}),
      })),
    },
  });

  for (const deck of spec.premadeDecks ?? []) {
    await request('POST', `/games/${game.id}/decks`, {
      displayName: deck.displayName,
      description: deck.description,
      gameId: game.id,
      componentCards: componentCards(deck.cards),
    });
  }
  for (const post of spec.lore ?? []) {
    await request('POST', `/games/${game.id}/lore`, { title: post.title, content: textOrFile(post.content) });
  }

  return {
    id: updated.id,
    name: updated.name,
    playable: updated.playable,
    cards: cardIds.size,
    slots: updated.gamePlayData.slots.length,
    premadeDecks: spec.premadeDecks?.length ?? 0,
    hub: `${WEB_BASE}/${updated.id}/hub`,
  };
}

validate();
await checkStockSlugs().catch((error) => fail(`couldn't check stock images at ${API_BASE}: ${error.message}`));
if (errors.length) {
  console.error(`spec has ${errors.length} problem(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
if (dryRun) {
  const cards = spec.sets.reduce((sum, set) => sum + (set.cards?.length ?? 0), 0);
  console.log(JSON.stringify({ valid: true, target: API_BASE, sets: spec.sets.length, cards, slots: spec.board.slots.length }));
  process.exit(0);
}
try {
  console.log(JSON.stringify(await build(), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
