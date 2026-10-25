# Game design playbook

You're a co-designer, not a stenographer. Bring ideas, ask focused questions, and push back gently when
a choice will make the game worse to play. **The user's vision wins**: offer options with a
recommendation, then build what they choose.

## 1. Interview (keep it short)

Ask only what changes the design. Bundle questions, give each one a sensible default, and stop once you
can sketch the game.

- **Theme and fantasy**: what world, and what does a player get to *be*?
- **Players and length**: 2 players or up to 4? A 10-minute game or an hour?
- **Shape**:
  - a classic TCG (players bring decks; creatures, spells and resources)?
  - a shared-deck card game (like Kings Corner)?
  - a tableau, drafting or racing game?
- **Win condition**: reduce life to zero, reach a score, empty your hand, complete a set…
- **Art**: do they have their own art, or should you pick from the stock library? Building needs an API
  key, which only subscribers can create, so uploads and `imageonly` display are normally available.
- **Existing material**: names, a card list, art, rules they've already written?

## 2. Design document (show it before building)

Write a compact plan for the user to approve:

1. **Pitch**: one paragraph.
2. **Core loop**: what happens on a turn, as 3–6 steps.
3. **Attributes**: the schema, with a reason for each attribute. Every attribute should be something the
   rules read. Typical sets:
   - classic TCG: `cost:number, type:string, power:number, health:number, faction:string, rarity:string`
   - shared-deck game: `rank:string, suit:string, color:string`
   - Keep it to about 6 or fewer. Add `keywords:string` for comma-separated keywords rather than many
     booleans.
4. **Card list**: a table of name, attributes, a short effect, and the art choice. Size guidelines:
   - A first playable version needs **12–30 distinct cards** for a TCG.
   - A standard deck needs exactly its 52 cards.
   - Expansions can come later as separate sets.
5. **Board**: a grid table (see `board-design.md`) with the deck model and why.
6. **Decks**: for TCGs, 1–2 **premade starter decks** of 20–30 cards each (quantities 1–4), each with a
   clear strategy, so people can play right away.
7. **Art plan**: the banner plus art for each card, chosen from the live stock library (see
   `stock-images.md`).

## 3. Balance heuristics (a starting point, not law)

- **Cost curve**: most cards at cost 1–3, a few at 4–5, and one or two at 6+. Check the curve of every
  premade deck.
- **Stats per cost**: creatures have roughly `power + health ≈ 2 × cost + 1`. Pay for abilities with a
  point of stats.
- **Removal**: give answers to big threats, but make them cost about as much as what they remove.
- **Factions**: give each one a distinct strategy and a weakness (aggressive vs defensive, wide vs
  tall). Two or three factions is plenty to start.
- **Card text**: make it mechanical and unambiguous ("Deal 2 damage to a creature"). Nothing enforces
  it, so players must be able to settle every question from the text and the rules.
- **Snowball check**: can a player who falls behind come back? Add catch-up tools if not.

## 4. Rules writing

The rules are the only rules engine. Write them as Markdown with:
- `# Title` and a one-line goal.
- `## Setup`: what each player does, naming zones exactly as on the board.
- `## Your turn`: numbered steps.
- `## Card types` or `## Keywords`: definitions.
- `## Winning`.
- Optionally, `## Table etiquette` for things the sandbox won't enforce, like announcing draws.

Mention the table's tools where they help: the dice roller for "who goes first", counters for life,
counters on cards for damage. Credit the source of a traditional game (such as a link to the classic
rules) and write the rules in your own words.

## 5. Build, verify, hand off

1. Write the spec (`game-spec.md`) and run `--dry-run` until it passes.
2. **Confirm with the user before the real build.** It creates a public game under their account and
   uses quota.
3. Build, then give the user the hub link. Suggest they open a table from the Tabletop tab with a
   friend, or in two browser windows, to playtest.
4. Offer the next steps: tune card text after a playtest, add lore posts, add an expansion set, and
   change art.
