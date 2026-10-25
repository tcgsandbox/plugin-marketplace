# TCG Sandbox API

- **Base URL:** `https://api.tcg-sandbox.com` (override with `TCG_SANDBOX_API`).
- **Full contract:** `GET /openapi.yaml`, or browse it at `/docs`. When something here looks out of
  date, check the live spec.

## Auth

Writes need `Authorization: Bearer <credential>`. The user creates an **API key** on tcg-sandbox.com
under **Account → API Key** (creating one needs the subscriber plan). It starts with `tcg_` and expires. **Never ask the user to paste the key
into the chat.** Have them save it to a file and point the scripts at it:

```bash
# the user runs this after copying the key (macOS; use xclip/wl-paste elsewhere)
pbpaste > ~/.tcg-sandbox-key && chmod 600 ~/.tcg-sandbox-key
export TCG_SANDBOX_API_KEY_FILE=~/.tcg-sandbox-key
```

Never print, log, or commit the key.

A **401 with an empty body** means the key is wrong, revoked or expired. Ask the user to make a new one.
Regenerating a key invalidates the old one.

Reads (games, sets, cards, premade decks, stock images) are public.

## Calling it

`scripts/tcg.mjs` is a zero-dependency client:

```bash
node scripts/tcg.mjs GET  /games/<id>
node scripts/tcg.mjs PUT  /games/<id> '{"rules":"# Rules\n..."}'
node scripts/tcg.mjs POST /games/<id>/sets/base/cards @card.json
```

For creating a whole game, prefer `scripts/build-game.mjs` with a spec; see `game-spec.md`.

## Endpoints you'll use

### Discovery
| Call | Notes |
|---|---|
| `GET /images/stock?kind=cards\|banners&q=&category=` | Curated free art: `{ images: [{ slug, name, category, tags, url }] }`. `q` searches names and tags. |
| `GET /games?q=<text>&filter=all&pageSize=100` | Search games by name; use it to check a name is free. |
| `GET /games?uid=<userId>` | Every game a user owns. |
| `GET /users/<userId>/usage` | The caller's quota usage. |

### Games
| Call | Body | Notes |
|---|---|---|
| `POST /games` | `{ name, description, bannerVerticalAlignment, attributes, bannerStockSlug? \| bannerImage? }` | `attributes` is the base set's schema (`{ "cost": "number" }`). Returns the `Game`, including `id` and `owner` (the caller's user id). 409 if the name is taken; 402 over the games quota. |
| `GET /games/<id>` | | |
| `PUT /games/<id>` | any of `{ name, description, bannerStockSlug, bannerImage, bannerVerticalAlignment, options, gamePlayData, rules, designNotes }` | Only the fields you send change. **`options` and `gamePlayData` are each replaced whole**, so send the full object. Saving `gamePlayData` recomputes `playable`. |
| `DELETE /games/<id>` | | Deletes the game with all its sets, cards, decks and lore. Irreversible: confirm with the user first. |

### Sets and cards
| Call | Body | Notes |
|---|---|---|
| `POST /games/<id>/sets` | `{ setId, displayName, description?, attributes }` | `setId` uses lowercase letters, digits and dashes. |
| `PATCH /games/<id>/sets/<setId>` | `{ addAttributes: { name: type } }` | Add-only; an existing key returns 409. |
| `DELETE /games/<id>/sets/<setId>` | | Deletes the set and its cards. |
| `POST /games/<id>/sets/<setId>/cards` | `{ name, attributes, description?, cardStockSlug? \| cardImage? }` | Returns the card with its `id`. |
| `PATCH /games/<id>/sets/<setId>/cards/<cardId>` | any of `{ name, description, attributes, cardStockSlug, cardImage }` | `attributes` merges per key; it doesn't replace the map. |
| `GET /games/<id>/sets/<setId>/cards` | | |
| `DELETE /games/<id>/sets/<setId>/cards/<cardId>` | | |

`cardImage` and `bannerImage` are data URLs (`data:image/png;base64,...`) and need a subscription.
Sending both an image and a stock slug returns 400.

### Board, options and rules
They all go through `PUT /games/<id>`:

```json
{
  "options": { "cardDisplayMode": "managed", "cardDisplayContext": "everywhere", "playerDecksEnabled": true },
  "rules": "# My Game\n\n## Setup\n...",
  "gamePlayData": {
    "playerCount": 2,
    "slots": [
      { "name": "Battlefield", "row": 1, "column": 0, "width": 6, "height": 1,
        "type": "cards", "maxCount": 6, "visibility": "public", "playerOwner": 1 },
      { "name": "Draw pile", "row": 2, "column": 2, "width": 2, "height": 2,
        "type": "preset_cards", "maxCount": 1, "visibility": "private", "playerOwner": null,
        "presetCards": { "mode": "shuffled", "topCardVisible": false,
          "cards": [{ "cardId": "<id>", "setId": "base", "quantity": 4 }] } }
    ]
  }
}
```

Every slot field except `name` and `presetCards` is required, including `playerOwner` (send `null`).
A bad preset slot returns 400 with the reason.

### Premade decks (game owner only)
| Call | Body |
|---|---|
| `POST /games/<id>/decks` | `{ displayName, description?, gameId, componentCards: [{ cardId, setId, quantity }] }` |
| `PUT /games/<id>/decks/<deckId>` | same; replaces the deck |
| `GET /games/<id>/decks` | public list |

These return 409 when the game has `playerDecksEnabled: false`, and 402 over the premade-deck quota.

### Lore (game owner only)
`POST /games/<id>/lore` with `{ title, content }` (Markdown). Use it for world-building, factions and
story.

## Status codes worth handling
| Status | Usually means |
|---|---|
| 400 | Invalid input. The body says why: a bad name, a bad preset slot, image plus slug, and so on. |
| 401 | Missing, expired or revoked key. |
| 402 | A free-tier quota or subscriber-only feature. The body names it. Don't retry. |
| 403 | Not the game's owner. |
| 404 | Wrong id or path. |
| 409 | Name taken, attribute already exists, or decks are off for this game. |
