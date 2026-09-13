# Verification — 12-game update

- `npm test`: 35 tests passed, 0 failed.
- `npm run build`: passed.
- Tested server rules for all 12 listed games, payout branches, item ownership and consumption, hidden game state, invalid bets, stale actions, recent duplicate requests, and saved rounds.
- HTTP test starts a separate server and verifies authentication denial, demo-proxy rejection, game catalog, duplicate-request handling, rejected-bet rollback, and database persistence.
- Existing owner permissions and timed-rain tests still pass.
- Browser visual/interaction testing was attempted, but Chromium was unavailable and its download timed out. No visual QA pass is claimed.
- Live Discord OAuth, Activity launch, and server commands have not been tested against your Discord application. They require your configured application credentials and server.
- The reference upgrader URL could not be loaded. Exact visual/behavioral parity is not claimed.

Game variants and remaining configuration needs are documented in README.md and in each game's rules panel.
