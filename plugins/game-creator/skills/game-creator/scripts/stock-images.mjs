#!/usr/bin/env node
// stock-images.mjs — browse the free stock art library and pick images for a game spec.
//
//   node stock-images.mjs categories [cards|banners]
//   node stock-images.mjs list [cards|banners] [--category <c>] [--q <text>]
//   node stock-images.mjs suggest <spec.json> [--top 3]   ranked art for every card without an image,
//                                                         plus banners for the game
//   node stock-images.mjs fetch <cards|banners> <slug,slug,...> <outDir>
//                                                         download previews to look at before choosing
//
// The catalog is public and changes over time, so always query it rather than relying on memory.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from './tcg.mjs';

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'your', 'you', 'it', 'its', 'is', 'card', 'cards']);

async function catalog(kind, { category, q } = {}) {
  const params = new URLSearchParams({ kind });
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  return (await request('GET', `/images/stock?${params}`, undefined, { auth: false })).images;
}

const tokens = (text) => String(text ?? '')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  // crude singularisation so "wolves"/"goblins" still meet "wolf"/"goblin"
  .flatMap((t) => [t, t.replace(/ves$/, 'f').replace(/ies$/, 'y').replace(/s$/, '')]);

/**
 * Exact name hits score highest, then partial name hits ("fireball" ~ "fire"), then words from the
 * card's description and attribute values.
 */
function score(image, primary, context) {
  const words = new Set([...tokens(image.slug), ...tokens(image.name), ...image.tags.flatMap(tokens)]);
  const partial = (t) => [...words].some((w) => w.length >= 4 && t.length >= 4 && (t.includes(w) || w.includes(t)));
  let total = 0;
  primary.forEach((t) => { total += words.has(t) ? 3 : partial(t) ? 2 : 0; });
  context.forEach((t) => { if (words.has(t)) total += 1; });
  return total;
}

function rank(images, primaryText, contextText, top) {
  const primary = [...new Set(tokens(primaryText))];
  const context = [...new Set(tokens(contextText))].filter((t) => !primary.includes(t));
  return images
    .map((image) => ({ slug: image.slug, name: image.name, category: image.category, score: score(image, primary, context) }))
    // Context words alone are too weak to stand on; an empty list means "browse by hand".
    .filter((match) => match.score >= 2)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, top);
}

async function suggest(specPath, top) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const [cards, banners] = await Promise.all([catalog('cards'), catalog('banners')]);
  const theme = `${spec.name} ${spec.description}`;
  const result = {
    banner: spec.banner ? { current: spec.banner } : { suggestions: rank(banners, theme, '', top) },
    cards: [],
  };
  const used = new Map();
  for (const set of spec.sets ?? []) {
    for (const card of set.cards ?? []) {
      if (card.image?.stockSlug) used.set(card.image.stockSlug, (used.get(card.image.stockSlug) ?? 0) + 1);
      if (card.image) continue;
      const context = `${card.description ?? ''} ${Object.values(card.attributes ?? {}).join(' ')}`;
      result.cards.push({ set: set.id, card: card.name, suggestions: rank(cards, card.name, context, top) });
    }
  }
  result.alreadyUsed = Object.fromEntries([...used].filter(([, n]) => n > 1));
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const kindArg = args[0] && !args[0].startsWith('--') ? args[0] : 'cards';

  switch (command) {
    case 'categories': {
      const counts = {};
      (await catalog(kindArg)).forEach((image) => { counts[image.category] = (counts[image.category] ?? 0) + 1; });
      console.log(JSON.stringify(counts, null, 2));
      break;
    }
    case 'list': {
      const images = await catalog(kindArg, { category: flag('category'), q: flag('q') });
      images.forEach((image) => console.log(`${image.slug}\t${image.category}\t${image.name}\t${image.tags.join(', ')}`));
      console.error(`${images.length} ${kindArg} image(s)`);
      break;
    }
    case 'suggest':
      if (!args[0]) throw new Error('usage: suggest <spec.json> [--top 3]');
      await suggest(args[0], Number(flag('top') ?? 3));
      break;
    case 'fetch': {
      const [kind, slugList, outDir] = args;
      if (!kind || !slugList || !outDir) throw new Error('usage: fetch <cards|banners> <slug,slug,...> <outDir>');
      mkdirSync(outDir, { recursive: true });
      const byslug = new Map((await catalog(kind)).map((image) => [image.slug, image]));
      for (const slug of slugList.split(',')) {
        const image = byslug.get(slug);
        if (!image) { console.error(`no ${kind} image "${slug}"`); continue; }
        const res = await fetch(image.url);
        if (!res.ok) { console.error(`${slug}: download failed (${res.status})`); continue; }
        const path = join(outDir, `${slug}.png`);
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        console.log(path);
      }
      break;
    }
    default:
      console.error('commands: categories | list | suggest | fetch (see the header of this file)');
      process.exit(2);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
