# Refract activity integration

Rogue Refract uses the documented `refract-activity/1` contract from the local Refract application and the same first-participant coordination pattern as [Refract Tic-tac-toe](https://github.com/Celzor/refract-tack-toe). There is no separate multiplayer server to configure. Refract authenticates the sender and relays the activity's JSON messages to the other people in the call.

`public/refract-activity.js` is an **unmodified copy** of the Refract instance's official helper (`oasis-core/backend/public/activities/refract-activity.js`), obtained on 26 October 2026. It includes push-to-talk forwarding, fullscreen requests, and refreshed-asset checks. Keep this file in step with the Refract application when its activity API changes.

`src/activity.js` adds the game-specific envelope `rogue-refract/1`. The host is always the earliest remaining participant in Refract's ordered roster. The game loop runs only on that browser. Other browsers render snapshots and send upgrade or control actions to the host. A player's action is attributed to Refract's relayed sender ID; a payload cannot pick a different acting user.

## Register the deployed game

1. Deploy the built `dist/` directory to GitHub Pages with GitHub Actions. Copy the final HTTPS deployment URL, including the repository path and trailing slash.
2. As an instance admin, open **Manage instance → Activities → Add an activity**.
3. Set the name to **Rogue Refract**, paste the final game URL, and use a description such as: **Catch the light. Build your orbit. Compete in 60-second rounds.**
4. Reload Refract to pick up the activity origin in its content security policy.
5. In a voice channel or private call, open **Activities → Rogue Refract**. Other people in the call can join the same activity.

For local development, register the local preview URL on a Refract instance outside production or with developer mode enabled. A loopback URL works only for browsers on the developer's machine. To play with friends on other machines, use the HTTPS deployment.

The activity must be served from an origin different from the Refract instance's origin and must allow embedding. Register the final URL: a redirect to a different origin prevents activity messages from being accepted. An instance with a manually configured `CSP_DIRECTIVES` must include the GitHub Pages origin in `frame-src`.

After deploying new files, use **Refresh** beside the registered activity. Existing open frames otherwise continue running the version they loaded.

## Bridge contract

```js
const bridge = createActivityBridge({
  onReady({ self, participants, sessionId, isHost, theme, mode }) {},
  onParticipants(people, { hostChanged, wasHost, isHost, hostId }) {},
  onAction(fromId, action) {}, // only on the host; validate against game rules
  onState(snapshot, { revision, epoch, hostId }) {}, // only on peers
  onConnection(mode) {}, // 'solo', 'connecting', or 'refract'
  onError(error) {},
  validateState(snapshot) { return true; }, // supply the game's schema validator
});

bridge.sendAction({ type: 'buy', upgradeId: 'example', round: 2 });
if (bridge.isHost) bridge.publishState(serializableGameState);
bridge.requestState();
bridge.setFullscreen(true); // call directly from a user gesture
```

The bridge exposes `self`, `participants`, `isHost`, `mode`, `sessionId`, and `fullscreen`, plus `close()` and `destroy()`. In standalone mode the local identity is `{ id: 'you', name: 'You', avatarUrl: null }`; Refract identities have positive numeric IDs. Standalone startup uses a microtask so callback code may refer to the assigned bridge variable.

`onReady` creates the simulation for a new session. The host should publish an initial snapshot immediately. `onParticipants` reconciles player additions and removals; when leadership changes, the new host resumes from the most recent accepted simulation state and publishes it with a fresh host epoch. Keep roster callbacks synchronous so the adapter's immediate catch-up snapshot reflects the new roster.

## Synchronization and trust

- Every envelope includes the Refract session ID and current host ID. State also includes the exact ordered participant IDs, a host epoch, and a monotonically increasing snapshot revision.
- Only the current host's relayed sender ID can supply snapshots. Peers reject stale revisions and foreign sessions, rosters, hosts, and malformed state.
- A fresh host epoch requires a correlated reply to the receiving page's own sync request. Reloaded hosts and host handovers cannot be confused with delayed snapshots from a previous load.
- A joining page asks for state after readiness. Peers ask again every three seconds to recover missed messages and host reloads. Refract does not retain a message history or echo the sender's broadcasts.
- Actions target the current host and include an epoch and unique action ID. The host deduplicates accepted IDs. The game itself validates action kind, phase, round, ownership, cooldowns, affordability, and other rules.
- State must stay below Refract's **16 KiB** JSON limit. Refract permits about **20 outgoing messages per second**, with short bursts; publish compact game snapshots at a modest cadence, such as four times per second. Do not put particles, trails, or other purely visual state in snapshots.
- The official helper accepts messages only from the framing window. The app holds no Refract credentials, cookies, or tokens.

The coordinating browser is trusted to run the simulation fairly. This is suitable for casual in-call competition; a future ranked or adversarial battle mode should use a server referee for anti-cheat and durable records. The transport already keeps actions separate from authoritative state so battle actions can be added without changing identity or relay plumbing.

## Verification limits

A local multi-frame relay harness can verify membership, late joins, score synchronization, actions, and host handovers. Final acceptance still requires two signed-in users in a real Refract call, including the desktop app if that is a target. No real call or public deployment is implied by local checks.

## Optional microphone loudness bonus

The game's opt-in local microphone analyzer supports direct HTTPS/localhost play and is compatible with the updated local Refract source inspected on 26 October 2026. That source now delegates microphone access to hosted activities at all three layers. This establishes source compatibility; the running instance and desktop build must also contain those changes.

| Refract source | Current behavior |
| --- | --- |
| `frontend/src/lib/activities.ts:43`, applied by `frontend/src/components/activities/ActivityFrame.tsx:213` | `ACTIVITY_PERMISSIONS` includes `microphone 'src'`, delegating capture to the activity frame's source origin. External activity frames retain `allow-same-origin`. |
| `backend/src/middleware/security.ts:43` and `backend/src/lib/permissionsPolicy.ts:9` | The response policy permits microphone capture for `self` and registered HTTPS activity origins, plus loopback HTTP development origins. It normalizes and deduplicates origins; camera and display capture remain restricted to `self`. For this GitHub Pages project, the microphone origin is `https://celzor.github.io`, without the repository path. |
| `electron/main.ts:640–688` and `electron/activityMicrophone.ts:41` | A focused, direct activity frame can request audio-only capture after a native origin-specific consent prompt. Grants are tied to the live frame and page URL for the app session; frame, origin and navigation checks remain in place. |

`src/microphone.js` already checks the browser's effective microphone policy before requesting audio with `getUserMedia`. It handles denial and unavailable devices, meters audio locally without playback or recording, and releases the stream when disabled or the page closes. It needs no new Refract protocol message for this direct-capture path. The game relays only normalized loudness values for scoring; raw microphone audio is not sent through the activity relay.

To verify the updated integration:

1. Deploy the Refract frontend and backend changes, and install a desktop build containing the Electron changes if testing there. Register the final HTTPS game URL, then reload the Refract host page and reopen or refresh the activity.
2. Open **Run details → Enable microphone** inside the game. Grant the browser permission or the desktop activity microphone prompt. Desktop capture uses the activity's own stream independently of the call's mute setting.
3. Confirm the meter responds to normal speech. During a Solar Surge, confirm that voice adds points, then turn the microphone off and confirm the meter stops.
4. If the game reports a blocked activity frame, check that the running host includes the updated iframe delegation and server policy. A reverse proxy can impose an additional restrictive Permissions-Policy; the effective browser policy must permit the registered game origin.

Packaged activities with opaque origins cannot use direct device capture. Browser or operating-system permission can still deny access, and the game remains fully playable without the microphone. Local checks do not replace a signed-in real-call test of the deployed instance and target desktop build. No Refract application files have been changed by this game project.
