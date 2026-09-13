# Spin Empire Discord Activity

The bot sets its Discord username to **Spin Empire** when it connects (only if different). If Discord rejects or rate-limits that update, it logs a warning and continues running. Also name the Discord application **Spin Empire** in the Developer Portal so the Activity launcher uses the same name; local files cannot rename the application without access to its settings. An existing server nickname may override the bot username.

A Discord Activity launched by `/play`, with 12 playable games, virtual item inventory, owner grants and timed rain. **Virtual coins and items only: no real money, purchasable currency, or external payouts.** The server controls outcomes, balances and active rounds.

## Included game variants

| Game | Implemented play |
| --- | --- |
| Poker | Single-player five-card draw video poker, hold/draw and published paytable (not multiplayer Hold’em) |
| Chicken Road | Step through lanes, risk collision, or cash out |
| Craps | Pass-line come-out and point rolls; no side bets |
| Crates | Buy a 1,000-coin crate, receive a virtual item, sell or upgrade it |
| Coinflip | Choose heads/tails; 50/50 outcome |
| Item Upgrader | Owned source item → higher-value target with displayed chance; source consumed on success or failure |
| Crash | Solo server-timed flight with cash-out; not a shared multiplayer flight |
| Hi-Lo | Predict higher/lower, build a multiplier, cash out |
| Plinko | Animated 12-row path and published pocket payouts |
| Mines | 25-tile board, configurable mine count, reveal/cash-out |
| Blackjack | Hit, stand, double; natural pays 3:2, no split/insurance |
| Roulette | European single zero, red/black/zero bets |

Each screen includes the exact rules and payouts. The supplied upgrader link could not be loaded: this is an original item-upgrade implementation, not a verified replica of that site's appearance or rules.

The header shows the live balance. The Withdraw button asks for a virtual-coin amount, deducts it from the game wallet, and posts `💸 Withdrawal — <username> withdrew <amount> coins.` in the first Discord text channel named exactly `withdraws`. Give the bot View Channel and Send Messages permission there. Selling an inventory item returns virtual coins to the game wallet.

The menu now contains the requested 12 games rather than Slots/Lottery. Any old lottery records remain preserved in the existing database, but that unfinished starter feature is not in this menu.

## 1. Create the Discord app

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), create an application, and add a bot.
2. Under **Installation**, enable **Guild Install** and **User Install**.
3. Under **OAuth2**, add `https://127.0.0.1` as a redirect URI.
4. Under **Activities → Settings**, enable Activities.
5. Copy `.env.example` to `.env` and enter the application ID, OAuth client secret, and bot token. Never upload `.env` to GitHub.

## 2. Install and run

```bash
npm install
npm run build
npm run register
npm start
```

For a production build:

```bash
npm run build
npm start
```

`npm run register` creates or updates `/play`, `/admin give`, `/rain`, and `/claim`. It updates an existing default Activity entry point instead of creating a second one. `/play` uses Discord's automatic Activity-launch handler. See [Discord entry-point documentation](https://docs.discord.com/developers/interactions/application-commands#entry-point-handlers).

## 3. Connect the Activity URL

Deploy the project to a public HTTPS host. Set the build command to `npm install && npx vite build` and the start command to `npm start`. Add all `.env` values in the host's environment-variable settings.

In **Discord Developer Portal → Activities → URL Mappings**, map `/` to the deployed hostname without `https://`. During local testing, you can expose port 3000 with Cloudflare Tunnel or ngrok and use that hostname instead.

## Owner coin command (new)

Use `/admin give user:@Member amount:10000` to add virtual coins, not transfer them from your own balance.

- Create a server role named exactly `owner` (lowercase) and assign it only to trusted people.
- The bot must be installed in the server with `bot` and `applications.commands` scopes. It does not need Administrator, Message Content, or privileged member intents.
- Run `npm install`, then `npm run register` again, then restart with `npm start`. Both the Activity server and admin bot run in this same process. Use Node.js 22.12 or newer.
- Keep the Developer Portal's Interactions Endpoint URL empty for Gateway delivery used by this bot.
- Only that exact role permits grants. Server ownership or Administrator permission alone does not bypass the check. The selected recipient must be a non-bot member of that server. DMs are rejected.
- Other members may see the command, but cannot execute it successfully. You can additionally limit its visibility in Server Settings → Integrations → your app → Commands.
- Replies are private. Grants persist alongside balances and include a grant log keyed by interaction ID to prevent duplicate credits.
- Balances remain global across servers, as in the original project. Every server's `owner` role can grant to its members; install this private bot only in trusted servers.
- The Activity polls balances while open so grants and rain credits appear automatically. Run only one server process against the JSON file.

Reference: [Discord application commands](https://docs.discord.com/developers/interactions/application-commands).

## Timed rain and claims

- `/rain amount:100000 duration:60` creates 100,000 virtual coins with a 60-second claim window. Duration is chosen in whole seconds from 10 to 86,400 (24 hours). Amount is 1–1,000,000,000.
- Only the exact lowercase `owner` role can start rain. The owner's balance is never charged and can be zero.
- Any human server member can `/claim` once during the window, including an owner. Nobody is entered automatically. Claiming joins the pool; payment happens after closing.
- One open rain per server. Claims are server-specific and rejected at or after the deadline.
- Each claimant receives the same whole-coin share. Leftovers carry into that server's next rain. If nobody claims, the entire pot carries over. Example: 10 coins / 3 claimants = 3 each, 1 carried over.
- Rain data, claims, and paid status persist in the same JSON database. Due payouts run within roughly 5 seconds of closing, or after restart if the bot was offline. Keep persistent storage and run exactly one process.
- The bot posts a starting notice and end summary. Allow View Channel and Send Messages; balances are still paid if the end message cannot be sent. Message retries may duplicate an announcement after a crash, but paid rain is not credited twice.
- Install updated files without overwriting `.env` or your existing `data` folder. Run `npm install`, `npm run register`, and restart `npm start` to enable `/rain` and `/claim`.

## Persistence, testing and deployment notes

- This starter uses a JSON data file at `data/casino.json`. Attach persistent storage when deploying, or balances reset after a redeploy. You can set `CASINO_DATA_DIR` to an absolute persistent directory. Back up that directory before updating. Never overwrite your real `.env` or data folder with test data.
- Sessions are kept in memory and reset when the server restarts.
- One active game round per player. Round state and inventory persist. Reloading resumes a card/Mines round; Crash continues by server time while offline and resolves on the next request.
- Bets and payouts are whole coins, with fractional payouts rounded down. Failed actions do not charge a bet. Recent request IDs and round versions protect against duplicate retries and stale clicks.
- This is a single-process JSON-backed starter, not a horizontally scaled casino service. Large public deployments need a transactional database, rate limiting, operational monitoring and security review.
- Set only `DISCORD_CLIENT_ID` on the server; the frontend reads the public ID at runtime. No secret is bundled in the browser build.
- `npm run build` rebuilds the UI after source edits. `npm test` runs the automated rules/permissions tests. Live Discord authorization and role behavior must still be checked with your own app.
- Optional local browser preview: set `LOCAL_DEMO=true`, leave `DISCORD_BOT_TOKEN` empty, and set `CASINO_DATA_DIR` to a separate disposable test folder. Run `npm start`, then visit `http://127.0.0.1:3000`. Preview mode binds to loopback, rejects forwarded login requests, and cannot authorize a demo session when `NODE_ENV=production`. Do not enable preview mode on a deployed server.
