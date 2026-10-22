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

## The cases

Each team investigates one hacked system through five **case files**. A case file works like this:

1. **Dossier (readable):** the team reads plain-text evidence in the story: emails, logs, notes. Hidden in it is a **riddle or puzzle** whose answer is the **KEY**. The puzzles vary: a riddle, a Morse or A1Z26 or Atbash or hex-ASCII line, an acrostic, a bit of arithmetic, or a callback to something in an earlier file.
2. **Locked file (encoded):** the key is needed to open the encoded file in [CyberChef](https://gchq.github.io/CyberChef/). The file has several layers (Base64, Hex, Base32, Binary, Decimal, Reverse, URL, ROT13 with an Amount) and a **keyed lock** (Vigenere, XOR or Rail Fence). Without the right key the output is garbage.
3. **Payoff:** the decoded text continues the story and contains an **ACCESS PHRASE**.
4. **Submit:** the team types the access phrase on their page. It shows up in your **Submissions** queue and you approve it. Approval opens the next file.

Stage 5 is the vault fragment. Its lock needs **the first key and the second key joined together** (the Vigenere keyword) and **the number from the third file** (the ROT13 Amount), so teams that kept good notes get through. It has seven layers. Its access phrase is "FRAGMENT n".

The site never tells teams how many layers a file has. Only the paid hints do.

The console shows each key and how it is found, so you can judge answers on the spot. The file `host-answer-key.md` has the whole list on one page (private, not committed).

## Live delivery (automatic)

When you press a button in the console (Start, Approve, Release hint, Open the vault, Reveal, Broadcast, Reset), the console sends a **signed message** over a free public channel ([ntfy.sh](https://ntfy.sh)). Every team page listens and reacts on its own: stages and hints unlock, broadcasts appear as a banner, and a reset sends every team back to the start. No typing needed.

- Team pages show **LIVE** (green) when connected and **OFFLINE** (red) when not. The console shows "LIVE: sent <time>" after each send.
- Messages from the console are signed with a key that only the admin console holds, so a participant can't fake a reset. The codes sent are still useless outside the team they belong to.
- Teams send their submissions to the console over a second channel. These are not signed, but nothing happens until you approve them.
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

### Team names

Teams are called Team Alpha, Bravo and so on by default. To rename them, type the new names into **Team names** at the bottom left of the console and press **Save names**. Every team page and the projector update straight away, and the names survive a reset. You can also set them at build time: `TEAM_NAMES="Cyber Owls,Null Pointers,Byte Me,Root Cause,Stack Smashers" ADMIN_PASSCODE=... node build.mjs` (in the order Alpha, Bravo, Charlie, Delta, Echo).

### 2. Each stage

1. A team reads its dossier, solves the riddle, decodes the locked file in CyberChef and **submits the access phrase** on its page.
2. The submission appears at the top of your console under **Submissions**, with the team, the stage, what they typed and whether it matches the expected answer.
3. Press **APPROVE** (or **Reject**, and the team sees "not accepted, try again"). Approving unlocks the next file on that team's devices by itself, with a story screen and an **OPEN CASE FILE** button.
4. **Dismiss** removes a stale submission (for example a second submission after you already approved the stage).

You can still press **VERIFY & UNLOCK** in the selected team's panel without waiting for a submission. If a team page shows OFFLINE, they can tell you in person and you press Verify, then read them the code shown in the console.

### 3. Hints
1. Press **Release hint 1** (or 2) for the team. The console shows an amber **HINT KEY**.
2. The hint appears on the team's page by itself and its cost comes off their score straight away. If their page is OFFLINE, give them the key to enter in the **Hints panel** (the box with the lightbulb).

Hint 1 costs 25% of the stage's points and hint 2 another 25%. A stage never scores below 25.

### 4. The vault

When a team finishes stage 5 it gets one **vault fragment** and one **recipe step**. Each team only sees its own piece, so they have to find the other teams.

1. Press **Open the vault**. Every team page jumps to a separate **Vault page** (safe, five fragment slots, the recipe pipeline and a "break the vault" box). If a page is OFFLINE, read out the **VAULT code** and they enter it in the code box.
2. Teams join the five fragments in order 1 to 5 with no spaces, then apply the five recipe steps in order 1 to 5 in CyberChef.
3. The first team to decode the message submits the **flag** (`GDG{...}`) on its vault page. It appears in your Submissions queue. **APPROVE** gives the bonus: +200, +100, +50 in the order you approve.
4. Press **Reveal final answer**. The projector plays the reveal and every vault page shows the message and "CASE CLOSED".

### Other controls
- **Projector vault view:** the projector shows the standings on the left and the vault on the right: a safe, five fragment slots that light up as teams finish stage 5, and the five recipe steps. When you open the vault it shows the instruction to join the fragments 1 to 5 and apply the steps 1 to 5. On **Reveal** the safe door swings open and the message and flag appear. Press **V** on the projector to show the vault full screen.
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
- `generate-challenges.mjs`: writes `challenges.json` from the story text and checks that every encoded file decodes back to its story. To change a story, edit it there, run `node generate-challenges.mjs`, then rebuild `data.js`. (Private, not committed. The original file is kept as `challenges.original.json`.)
- `host-answer-key.md`: all keys and recipes on one page. Private.
