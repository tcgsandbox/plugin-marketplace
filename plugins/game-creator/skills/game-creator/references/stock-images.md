# Choosing stock art

TCG Sandbox has a curated library of **free stock images** that every user can put on cards and
banners, including free-tier users. Uploading your own art needs a subscription. So for most users stock
art is the only art, and choosing it well does much of the work of making a game feel finished.

## What's in the library

There are two kinds, **`cards`** and **`banners`**, each grouped into categories. The library grows over
time, **so always query it** instead of relying on the list below. This is a snapshot of its shape:

| Kind | Categories (roughly) |
|---|---|
| cards | `fantasy` (warriors, wizards, monsters, weapons, potions…), `animals`, `elements` (fire, ice, lightning, water, wind…), `nature` (forests, mountains, villages…), `sci-fi` (robots, aliens, gear…), `treasure` (coins, crowns, keys…), `abstract` (health, poison, strength, time…), `other` (ships, tools, a full standard 52-card deck `playing-card-<rank>-of-<suit>`, and the default card back) |
| banners | `fantasy`, `nature`, `sci-fi`, `elements`, `animals`, `abstract`, `other` (including `playing-cards-fan` and the `tcg-sandbox-icon` placeholder) |

Banners are wide scenes about 5:1. Card images are portrait illustrations.

## Tools

```bash
node scripts/stock-images.mjs categories cards            # what categories exist, with counts
node scripts/stock-images.mjs list cards --category fantasy
node scripts/stock-images.mjs list cards --q dragon         # searches names and tags
node scripts/stock-images.mjs list banners
node scripts/stock-images.mjs suggest game.json             # ranked picks for every card without art
node scripts/stock-images.mjs fetch cards goblin,wizard /tmp/previews   # download PNGs to look at
```

`suggest` matches each card's name (and, more weakly, its description and attribute values) against
image names and tags. An empty suggestion list means nothing matched, so browse by category instead.
`fetch` saves the actual images. **Look at the candidates before choosing**: open the PNGs with your
image-reading tool. Tags say what's in an image but not its style or mood.

## How to choose

1. **Start from the theme.** After the interview, list the categories that fit (a pirate game wants
   `other` ships, `treasure`, `animals` sharks and birds, `elements` water). Show the user a few
   candidates for the key cards and the banner, and let them decide where taste matters.
2. **Match the card's role, not just its name.** "Frost Sentinel" has no image of its own, but `warrior`
   (a defender) or `ice` (its element) both work. Pick the one that tells players what the card does.
3. **Be consistent within a faction or type.** Players learn a visual language quickly. If spells use
   element art (`fire`, `ice`) and creatures use character art, keep to that split.
4. **Reuse is allowed.** Several cards can share an image; `suggest` reports `alreadyUsed`. With
   **`managed` display** (the default) every card still shows its own name, attributes and text, so
   sharing art is fine. Avoid reuse with **`imageonly`** display, where cards that share art look
   identical. That's exactly why `imageonly` is a subscriber feature.
5. **Generic art for generic cards.** Resources, tokens and counters suit `abstract` and `treasure`
   art: `coin`, `crystal-01`, `health`, `strength`, `time`.
6. **The banner sets the tone.** Pick a banner whose scene matches the world (`dungeon-01`, `space-01`,
   `ocean-01`…). `tcg-sandbox-icon` is the neutral placeholder; avoid it for a finished game.
7. **No art is an option.** A card with no image shows the shared card back. That's fine for hidden or
   generic cards, but finished games should give every visible card art.

## Using a choice

In a game spec:

```json
{ "banner": { "stockSlug": "dungeon-01" } }
{ "name": "Goblin Raider", "image": { "stockSlug": "goblin" }, "attributes": { } }
```

Through the API directly:
- `POST /games` with `bannerStockSlug`;
- `POST` or `PATCH` a card with `cardStockSlug`;
- `PUT /games/<id>` with `bannerStockSlug` to change the banner later.

Send the **bare slug**. The server stores the reference `stock:cards/<slug>`. `build-game.mjs --dry-run`
checks that every slug exists.

## When the library doesn't have it

- A subscriber can upload their own art: `image: { "file": "art/x.png" }` in the spec, or
  `cardImage` / `bannerImage` data URLs in the API.
- A free user picks the closest stock image. Make up for it with a good card name and description,
  which `managed` display shows prominently.
- Note gaps in the library for the user. The library is curated by hand and grows over time.
