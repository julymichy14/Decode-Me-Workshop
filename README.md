# Decode Me If You Can: The Vault

A live decoding game for a workshop. Five teams each investigate a different hacked system through five stages of layered encoding. The five teams then combine their vault fragments to open the vault.

Teams decode everything in [CyberChef](https://gchq.github.io/CyberChef/). **This site never decodes anything and never checks answers.** The host checks a team's code word in person and gives them a code that unlocks the next stage.

## How it works

The site is static (GitHub Pages, no server). Every locked stage, hint and the vault message is encrypted in `data.js`. A team's browser only gets the readable text after the team enters the matching code. Page source and DevTools show nothing about locked stages.

| Page | Who | What it is |
|---|---|---|
| `#/` | Everyone | Landing page. Teams enter their join code. |
| `#/team/<id>` | A team | The team's workspace. |
| `#/admin` | Host only | Control console. Needs the admin passcode. |
| `#/screen` | Projector | Standings and the vault board. |

## Live delivery (automatic)

When you press a button in the console (Start, Verify, Release hint, Open the vault, Reveal, Broadcast, Reset), the console sends a **signed message** over a free public channel ([ntfy.sh](https://ntfy.sh)). Every team page listens and reacts on its own: stages and hints unlock, broadcasts appear as a banner, and a reset sends every team back to the start. No typing needed.

- Team pages show **LIVE** (green) when connected and **OFFLINE** (red) when not. The console shows "LIVE: sent <time>" after each send.
- Messages are signed with a key that only the admin console holds, so a participant can't fake a reset. The codes sent are still useless outside the team they belong to.
- Messages are kept for about 12 hours, so a phone that joins late or reconnects catches up by itself.
- It needs internet access to ntfy.sh. **If it is blocked or down, everything still works by hand:** the console still shows each code, and teams type it into the Clearance code box (or the Hint key box).

## Setup (once, before the event)

1. Put `challenges.json` in the project folder. It holds every answer, so it is in `.gitignore`. **Never commit it.**
2. Build with a passcode of your choice:
   ```bash
   ADMIN_PASSCODE=your-strong-passcode node build.mjs
   ```
   This writes `data.js`. Every build makes **new** join codes and clearance codes, so build once and don't rebuild after the game starts.
3. Commit and push these files: `index.html app.js style.css data.js favicon.svg build.mjs README.md .gitignore`.
4. In the GitHub repo, go to Settings → Pages → deploy from branch `main`, folder `/ (root)`. Wait a couple of minutes.
5. Open `<your site>/#/admin`, enter the passcode, and print the **join codes** shown at the bottom left.

To try it locally: run `python3 -m http.server` in the folder and open `localhost:8000`.

## Running the game

You need two windows on the host laptop:

- **Admin console:** `#/admin`
- **Projector:** open `#/screen` from the console (OPEN PROJECTOR) and put it on the big screen. The two windows share state through the browser, so the projector only updates if it is in the **same browser on the same laptop** as the console.

### 1. Start
1. Hand each team its join code. They enter it on the landing page.
2. Press **START GAME**. Stage 1 appears on every team page by itself. The console also shows the **START code**, which teams can type into the Clearance code box if a page shows OFFLINE.

### 2. Each stage
1. A team decodes their stage in CyberChef and walks over with the code word.
2. Open that team in the console. The expected answer is shown big in green, with the decoded text, the CyberChef recipe and both hints.
3. If it matches, press **VERIFY & UNLOCK**. The console shows a **clearance code**.
4. The next stage opens on that team's devices by itself and their score updates. If their page shows OFFLINE, read them the code and they enter it in the Clearance code box.

The "Team said" box is optional. It only shows MATCH or NO MATCH to help you.

### 3. Hints
1. Press **Release hint 1** (or 2) for the team. The console shows an amber **HINT KEY**.
2. The hint appears on the team's page by itself and its cost comes off their score straight away. If their page is OFFLINE, give them the key to enter in the **Hints panel** (the box with the lightbulb).

Hint 1 costs 25% of the stage's points and hint 2 another 25%. A stage never scores below 25.

### 4. The vault
When a team finishes stage 5 they get one **vault fragment** and one **recipe step**. Teams need to find each other. Each team only sees its own piece, so they have to talk.

1. When the teams have their pieces, press **Open the vault**. The vault panel appears on every team page (or read out the **VAULT code** for OFFLINE pages).
2. They join the five fragments in order 1 to 5 with no spaces, then apply the five recipe steps in order 1 to 5 in CyberChef.
3. The first team to bring you the flag (`GDG{...}`) gets a bonus. Use the **Flag bonus** buttons: +200, +100, +50 in the order you press them.
4. Press **Reveal final answer**. The projector plays the reveal and team pages show the message and "CASE CLOSED" (or read out the **REVEAL code** for OFFLINE pages).

### Other controls
- **Pause all** freezes the game clock on the projector.
- **Broadcast** shows a message on the projector and as a banner on every team page.
- **Hold team** stops you verifying a team by accident. It does not lock their browser.
- **Undo last verification** rolls the team back in your console and refunds the points. A team keeps anything their devices already unlocked.
- **Reset game** clears the console and projector and sends every team page back to the start. Press it twice to confirm. See "Starting a new round" below.
- The **Codes issued** list for the selected team shows every code you have given them.
- The **Event log** shows everything that happened, with times.

## Starting a new round

1. Press **Reset game** (twice). Every team page that is online resets to "Waiting for clearance" and clears its notes. A device that was offline resets as soon as it reconnects.
2. Press **START GAME** when you are ready. Stage 1 appears on every team page.

If a team page still shows old progress (it was offline and never reconnected), they can type the START code into the Clearance code box. A second press confirms and restarts them from stage 1.

To wipe **every** device at once (for example between a test run and the real event), rebuild `data.js` with `node build.mjs` and push it. Any device that loads the new build forgets its team login, codes and notes, and teams log in again with the new join codes.

## Good to know

- **Every device updates itself.** Each phone or laptop logged in as the team receives the same unlocks. Progress survives a refresh.
- **Scores:** stage points are 100, 150, 200, 300 and 400 (1,150 per team). Ties are broken by who finished earliest.
- **Clearing the browser** on the host laptop clears the game state, so don't clear site data mid-event.
- **Everything is fictional.** Domains are `.example` and IPs are `192.0.2.x`.

## Troubleshooting

- **Changes don't show after a push:** wait two minutes, then hard-refresh with Cmd+Shift+R. Check the Actions tab for a green check.
- **"ERR: code rejected":** codes are case-insensitive but must match exactly. Check you are reading from the right team's list in the console, and that a hint key goes in the Hints panel.
- **Projector not updating:** make sure it is open in the same browser as the admin console, not on another device. The projector does not use the live channel.
- **A team page shows OFFLINE:** the device can't reach ntfy.sh (venue Wi-Fi may block it). Use the manual codes shown in the console.
- **Forgot the passcode:** rebuild with a new one. This regenerates all codes, so do it before the event.
- **Screenshots or testing:** add `?nofx` to the URL (for example `.../?nofx#/`) to skip the boot sequence and animations.

## Files

- `index.html`, `style.css`, `app.js`: the site.
- `data.js`: generated and encrypted. Don't edit it by hand.
- `build.mjs`: turns `challenges.json` into `data.js`.
- `favicon.svg`: the tab icon.
- `challenges.json`: the source content with all answers. Keep it private.
