# Rogue Refract

A multiplayer orbital roguelite for Refract.Chat. The arena is based on Refract's tilted voice-channel orbit: real participant avatars circle the Refract core, catching rays, colliding, and stacking increasingly ridiculous builds.

## Play locally

Requires Node.js 22.8 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:4173**. Standalone mode includes five explicitly labeled practice bots. Open **How to play** for the field guide.

```sh
npm run check
npm test
npm run build
npm run preview
```

`dist/` is the complete deployable site. The build works at a GitHub Pages repository subpath, with relative URLs and native ES modules. There is no backend, database, package install, or build framework.

## The loop

- **60-second heats:** rays, collisions, and revolutions award points, XP, and shards. Your pilot spins automatically; change lanes for opportunities.
- **Orbit burst:** +65% speed and double scoring for four seconds, with a 20-second cooldown before upgrades.
- **Stars:** click for 60 points and 1.5× scoring for six seconds.
- **Refract chips:** click for 25 shards and +25% speed for six seconds. Pickups are shared; the first accepted claim wins.
- **Solar Surges:** two eight-second windows per heat, starting at 15 and 40 seconds. Optional local microphone loudness earns up to 100 points per second. Normal speaking is enough; audio is never recorded or transmitted. Only a normalized loudness value is relayed.
- **Level up:** each level earns a free shop choice.
- **30-second shop:** choose among three rolling offers, buy additional upgrades with shards, or pay for a reroll. All human players readying up starts the next heat early.
- **28 stackable upgrades:** velocity, critical triples, critical multipliers, echoes, combos, collision bonuses, passive points, shard income, XP boosts, burst tuning, and compound effects.
- **Endless run:** XP, levels, upgrades, and total scores persist between heats. New runs reset the shared build and scores; personal bests persist in browser storage. Session state is held by participants, so a run ends when everyone closes it. Hosts can start a fresh run in Settings.

Controls: **A / D** or **Left / Right** to switch lanes, **Space** to burst, **F** for fullscreen, and pointer/touch to collect pickups. All game controls also have buttons. Reduced-motion preferences suppress decorative particles and pulses, and can be adjusted in Settings.

## Deploy to GitHub Pages

The `origin` for this checkout is `https://github.com/Celzor/RogueRefract`.

1. Commit and push the source to `main`.
2. In the repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions**.
3. The included `.github/workflows/pages.yml` runs syntax checks, the unit suite, builds `dist/`, and deploys it with the official Pages actions. Re-run it with **Actions → Deploy Rogue Refract to Pages → Run workflow** if Pages was enabled after the first push.
4. Use the actual deployment URL reported by the workflow. With default project Pages settings, this is expected to be `https://celzor.github.io/RogueRefract/`.
5. Register that final URL under **Manage instance → Activities** in Refract, reload the app, then launch it from a call. Use **Refresh** on the activity after later deployments.

No public deployment is performed by the local build. See [Refract integration](docs/REFRACT-INTEGRATION.md) for the relay contract, installation steps, and microphone capability requirements.

### Microphone in Refract

Direct HTTPS/localhost play supports opt-in microphone metering now. The inspected Refract application blocks cross-origin activity microphone capture at its iframe, production Permissions-Policy, and Electron permission layers. The game detects this and explains it. Embedded microphone play needs a corresponding Refract app change; the [integration guide](docs/REFRACT-INTEGRATION.md#optional-microphone-loudness-bonus) identifies the exact files and recommends an explicitly consented loudness relay using Refract's existing voice pipeline. Sound effects, pickups, and every other scoring source work without microphone capture.

## Multiplayer and future battles

The first participant coordinates a fixed-step simulation. Refract supplies authenticated identities and relays commands; followers render snapshots. Late joiners request current state, and the next participant resumes the last synchronized run when the coordinator leaves. Up to **eight active pilots** share a run. Standalone bots are never represented as real users inside Refract.

`src/game.js` is pure simulation; `src/activity.js` handles identity, membership, and transport; the renderer and audio are independent. The host validates commands, affordability, phase, pickup ownership, mic sampling rate, and cooldowns. It publishes two compact snapshots per second; raw audio, particles, and avatar images are excluded from relay state.

The future battle mode can add move selection, target IDs, statuses, elemental affinities, and revolution-triggered turns to this same action/event model. The Battle panel is a labeled roadmap preview, not a playable mode. Casual play trusts the coordinating browser; ranked or adversarial PvP will need a server referee and persistent match records.

## Verification

`npm test` covers deterministic simulation, all scoring sources, round transitions, economy validation, upgrades, pickups, microphone caps, relay authentication, catch-up, and host handover. Browser harnesses in `tests/browser.mjs` and `tests/multiplayer.mjs` run separately with Playwright supplied by the environment. They exercise real UI and the official iframe helper against a simulated authenticated Refract relay. A real signed-in Refract call remains the final integration acceptance check.

With the dev server running and Playwright available, run `node tests/browser.mjs` and `node tests/multiplayer.mjs`. `PLAYWRIGHT_PATH` can point to an existing Playwright package directory; `TEST_URL` selects a different preview URL. On Windows the harnesses use installed Microsoft Edge by default. The solo harness saves desktop and mobile screenshots under `test-results/`.

## Source and license

Licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE). The Refract brand mark and the unmodified official `public/refract-activity.js` helper come from the local Refract application. Integration follows that app's activity documentation and the [Refract Tic-tac-toe example](https://github.com/Celzor/refract-tack-toe). The game, renderer, upgrade system, synthesized audio, and local microphone analyzer are implemented in this project. Refract branding remains with its owner.
