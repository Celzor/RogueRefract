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

- **One-screen play:** a compact pilot HUD keeps the arena in view. The shop only appears during buy rounds, directly over the arena. Leaderboard, build, statistics and microphone controls live in **Run details**.
- **Five rings:** orbit automatically; move inward/outward with A / D or the arrow keys, select a ring with 1-5, or tap its numbered control.
- **60-second heats:** rays, collisions, revolutions and absorbed orbs award points. Rays also grant XP and shards.
- **Contact pickups:** orbs spawn directly on the rings. Move your avatar into one to absorb it; the first physical contact wins. Every orb grants a points bonus. Clicking an orb does not collect it.
- **Beam chaos:** Prism bloom adds five centre beams for 20 seconds per stack, capped at 50 total. Light rush stacks +25% ray rotation speed, up to 3x. Each field stack expires independently.
- **Rival effects:** ice halves rivals' movement speed; time stop freezes movement and ring changes; gravity wells pull rivals inward every 0.75 seconds. Prism shields clear and block hostile effects.
- **Other temporary powers:** Starlight boosts scoring, Refract chips grant shards and speed, Overdrive increases spin speed, and Echo repeats ray point rewards. Repeated personal buffs extend their timers within a cap. All temporary powers clear between heats.
- **Orbit burst:** +65% speed and double scoring for four seconds, with a 20-second cooldown before upgrades.
- **Solar Surges:** two eight-second windows per heat, starting at 15 and 40 seconds. Optional local microphone loudness earns up to 100 points per second. Normal speaking is enough; audio is never recorded or transmitted. Only a normalized loudness value is relayed.
- **Level up:** each level earns a free shop choice, with an arena banner, expanding avatar rings and spark trails. Reduced effects use a steady halo.
- **30-second shop:** buy rounds replace the arena view; choose among three rolling offers, buy additional upgrades with shards, or pay for a reroll. All human players readying up starts the next heat early.
- **28 stackable upgrades:** velocity, critical triples, critical multipliers, echoes, combos, collision bonuses, passive points, shard income, XP boosts, burst tuning, and compound effects.
- **Endless run:** XP, levels, upgrades, and total scores persist between heats. New runs reset the shared build and scores; personal bests persist in browser storage. Session state is held by participants, so a run ends when everyone closes it. Hosts can start a fresh run in Settings.
- **Back to lobby:** the host can return the group to the lobby from a heat or buy round. Builds and scores remain, and combat effects clear. Choose Orbit or Battle and the combat style before starting again.

## Battle

Select **Battle** in the lobby. The opening buy round gives each new pilot 60 starting shards to choose their first move; every move is purchased. Keep orbiting to score from light rays, collisions, revolutions and pickups, then spend those shards and free level-up choices between heats. Battle includes the same five labeled practice bots in standalone play and authenticated participants inside Refract.

- **Turn based:** all living pilots keep orbiting, collecting light and earning points. The active pilot has ten seconds to choose a target and cast, or pass. A cast spends Light Points (LP) and one use of that move's PP, then advances the turn. Stun skips the victim's next turn as well as briefly stopping movement. Empty turns pass automatically.
- **No limits:** anyone can cast when their shared 2.5-second cooldown is ready. LP and PP do not limit or get consumed by casts. Light orbs still award points, and all moves must still be purchased.
- **Target every cast:** choose a living rival for damage or stun, or yourself for heal, reflect or shield. The selection clears after casting. The controls show the current turn, cooldown, rank, LP requirement and remaining PP.
- **Health and elimination:** everyone starts a heat with 100 HP. Every pilot has a visible health bar in the roster and above their avatar. At zero HP, a pilot stops orbiting and cannot score, collect or act for the rest of that heat. Eliminations award 150 points, 20 shards and XP. The last living pilot wins immediately: **Winner winner chicken dinner!** If sixty seconds expire with multiple survivors, the buy round opens without a last-survivor winner.
- **Next heat:** health and PP refill, statuses clear, and everyone re-enters. Held LP, purchased ranks and total scores carry forward. The buy round awards the normal 35 shards after a completed heat; returning to the opening shop does not award extra income.

### Purchased moves

These are rank-one values; LP and PP apply to turn-based combat.

| Move | Shards | LP | PP / heat | Effect |
| --- | ---: | ---: | ---: | --- |
| Photon strike | 35 | 3 | 8 | 20 damage to a chosen rival |
| Mending light | 30 | 4 | 4 | Restore up to 24 HP to yourself |
| Mirror veil | 40 | 5 | 3 | Reflect the next hostile move within 6 seconds; one bounce only |
| Static pulse | 40 | 5 | 4 | 8 damage and 1.2 seconds of stun; also skip one turn in turn-based combat |
| Aegis shell | 35 | 4 | 4 | Absorb 20 damage for up to 8 seconds |

Each move has **five ranks**. Rank 1 is available in the opening shop, rank 2 after heat 1, rank 3 after heat 2, and so on. Each additional rank costs 25 more shards and adds one PP. Per rank, Photon strike adds 6 damage, Mending light adds 7 healing, Mirror veil adds 1 second, Static pulse adds 3 damage and 0.3 seconds of stun, and Aegis shell adds 10 shield HP. LP requirements increase by one at ranks 3 and 5. The shop previews the next rank's effect and marks ranks that are still locked.

### Light orbs and upgrades

Collect **Light motes (+2 LP)**, **Light clusters (+4 LP)** and **Nova orbs (+6 LP)** by moving into them. They also award 20, 35 and 50 base points respectively. At least every other battle drop supplies LP. Fuel orbs never refill PP; the buy round does that.

The **Light orbs** shop tab offers two permanent, three-rank upgrades, with the same heat gates as moves:

| Upgrade | Starting cost | Per rank | Maximum |
| --- | ---: | --- | --- |
| Light reservoir | 50 shards | +5 LP capacity from a base of 20 | 35 LP |
| Orb condenser | 55 shards | +1 LP collected from each light orb | +3 LP per orb |

Each additional orb-upgrade rank costs 35 more shards. Free level-up choices can pay for move or orb upgrades, and the original 28 orbit upgrades remain available in their own shop tab. LP upgrades matter in turn-based combat; no-limits casts use cooldowns alone.

Controls: **A / D** or **Left / Right** to change rings, **1-5** to select a ring directly, **Space** to burst, and **F** for fullscreen. All gameplay actions also have touch buttons. Reduced-motion preferences suppress decorative particles and pulses, and can be adjusted in Settings.

## Deploy to GitHub Pages

The `origin` for this checkout is `https://github.com/Celzor/RogueRefract`.

1. Commit and push the source to `main`.
2. In the repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions**.
3. The included `.github/workflows/pages.yml` runs syntax checks, the unit suite, builds `dist/`, and deploys it with the official Pages actions. Re-run it with **Actions → Deploy Rogue Refract to Pages → Run workflow** if Pages was enabled after the first push.
4. Use the actual deployment URL reported by the workflow. With default project Pages settings, this is expected to be `https://celzor.github.io/RogueRefract/`.
5. Register that final URL under **Manage instance → Activities** in Refract, reload the app, then launch it from a call. Use **Refresh** on the activity after later deployments.

No public deployment is performed by the local build. See [Refract integration](docs/REFRACT-INTEGRATION.md) for the relay contract, installation steps, and microphone capability requirements.

### Microphone in Refract

The updated local Refract source supports opt-in microphone capture for registered HTTPS activities through iframe delegation, its server Permissions-Policy, and a separate desktop consent prompt. Rogue Refract's existing microphone meter is compatible: open **Run details → Enable microphone**, grant access, and speak during a Solar Surge. Deploy the corresponding Refract changes and reload the host page before testing; local source checks do not confirm the live instance or desktop build. See the [integration guide](docs/REFRACT-INTEGRATION.md#optional-microphone-loudness-bonus) for requirements and verification steps. The game remains playable without microphone access.

## Multiplayer

The first participant coordinates a fixed-step simulation. Refract supplies authenticated identities and relays commands; followers render snapshots. Late joiners request current state, and the next participant resumes the last synchronized run when the coordinator leaves. Up to **eight active pilots** share a run. Standalone bots are never represented as real users inside Refract.

`src/game.js` is pure simulation; `src/activity.js` handles identity, membership, and transport; the renderer and audio are independent. The host validates commands, affordability, phase, pickup ownership, mic sampling rate, and cooldowns. It publishes two compact snapshots per second; raw audio, particles, and avatar images are excluded from relay state.

The coordinator validates move ownership, turn order, targets, LP, PP, cooldowns, shields, elimination and purchase rank gates. Packed snapshots include combat state so late joiners and replacement hosts continue the current battle. Casual play trusts the coordinating browser; ranked or adversarial PvP will need a server referee and persistent match records.

## Verification

`npm test` covers deterministic simulation, all scoring sources, round transitions, economy validation, upgrades, pickups, microphone caps, relay authentication, catch-up, and host handover. Browser harnesses in `tests/browser.mjs` and `tests/multiplayer.mjs` run separately with Playwright supplied by the environment. They exercise real UI and the official iframe helper against a simulated authenticated Refract relay. A real signed-in Refract call remains the final integration acceptance check.

The battle suite also covers all five moves, rank and resource validation, physical LP collection, turn ownership and passing, no-limits cooldowns, elimination, survival victories, bots, and lossless snapshots within the 16 KiB relay envelope. `node tests/battle-browser.mjs` runs battle UI acceptance using installed Microsoft Edge (or `BROWSER_EXECUTABLE`) without a Playwright dependency, checks desktop and mobile viewports, and saves screenshots to `test-results/`.

With the dev server running and Playwright available, run `node tests/browser.mjs` and `node tests/multiplayer.mjs`. `PLAYWRIGHT_PATH` can point to an existing Playwright package directory; `TEST_URL` selects a different preview URL. On Windows the harnesses use installed Microsoft Edge by default. The solo harness checks that gameplay and buy rounds fit desktop and mobile viewports without page scrolling, and saves screenshots under `test-results/`.

## Source and license

Licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE). The Refract brand mark and the unmodified official `public/refract-activity.js` helper come from the local Refract application. Integration follows that app's activity documentation and the [Refract Tic-tac-toe example](https://github.com/Celzor/refract-tack-toe). The game, renderer, upgrade system, synthesized audio, and local microphone analyzer are implemented in this project. Refract branding remains with its owner.
