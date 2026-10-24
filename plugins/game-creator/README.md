# game-creator

A Claude Code plugin that co-designs a custom card game with you and builds it on
[TCG Sandbox](https://tcg-sandbox.com): cards with art, a board, rules, and starter decks.

## Use it

1. Add this marketplace and install the plugin:
   ```
   /plugin marketplace add <path-or-git-url-of-this-repo>
   /plugin install game-creator@tcg-sandbox
   ```
2. Create an API key on tcg-sandbox.com under **Account → API Key**. Save it to a file, never into the
   chat:
   ```bash
   pbpaste > ~/.tcg-sandbox-key && chmod 600 ~/.tcg-sandbox-key
   export TCG_SANDBOX_API_KEY_FILE=~/.tcg-sandbox-key
   ```
3. Ask Claude: *"Help me make a card game about rival wizard schools."*

Claude interviews you, writes a design doc for your approval, picks art from the free stock library,
writes a game spec, validates it, and builds the game once you confirm.

## What's inside

| Path | Purpose |
|---|---|
| `skills/game-creator/SKILL.md` | The workflow and the rules of thumb. |
| `skills/game-creator/references/` | Platform model, API, board design, stock art, design playbook, spec format. Loaded on demand. |
| `skills/game-creator/scripts/tcg.mjs` | A zero-dependency API client. |
| `skills/game-creator/scripts/build-game.mjs` | Builds a whole game from one JSON spec (`--dry-run` validates). |
| `skills/game-creator/scripts/stock-images.mjs` | Browses the stock art library, suggests art for a spec's cards, and downloads previews. |
| `skills/game-creator/examples/` | Complete specs: Ember and Frost (TCG), Kings Corner and Trash (52-card deck games). |

The scripts need Node 18 or newer and have no dependencies. They target `https://api.tcg-sandbox.com`
unless `TCG_SANDBOX_API` is set.
