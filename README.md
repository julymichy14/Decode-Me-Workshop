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
4. **Submit:** the team types the access phrase on their page. **The page checks it automatically.** A correct phrase opens the next file at once ("ACCESS GRANTED"). A wrong one shows "ACCESS DENIED, try again". After three wrong tries in a row the box locks for a few seconds. Capitals, spaces and punctuation do not matter.

Stage 5 is the vault fragment. Its lock needs **the first key and the second key joined together** (the Vigenere keyword) and **the number from the third file** (the ROT13 Amount), so teams that kept good notes get through. It has seven layers. Its access phrase is "FRAGMENT n".

The site never tells teams how many layers a file has. Only the paid hints do.

The console shows each key and how it is found, so you can judge answers on the spot. The file `host-answer-key.md` has the whole list on one page (private, not committed).

## How the checking works (no admin needed)

Each file is encrypted with a key made from the **previous file's access phrase**. Typing the right phrase decrypts the next file in the team's own browser; a wrong phrase simply fails. Nothing is sent to anyone to be checked, so there is no approval step and no code to read out. The console cannot see or change a team's answers; it only **monitors**.

- **Teams to console:** every team page reports its progress (stage reached, hints used, flag found) to the console over a free public channel ([ntfy.sh](https://ntfy.sh)). The console shows it live, calculates scores, and the projector follows. These reports are not signed, so a participant could fake one for the scoreboard. Nothing in the game depends on them.
- **Console to teams:** Start, Broadcast, Reset, team renames, "Grant access" and the vault opening go to the team pages over the same service, signed with a key only the console holds, so nobody can fake a reset.
- A device that joins late or reconnects catches up on its own (messages are kept for about 12 hours).
- **Offline:** the answer checking works with no internet at all. Only the live parts need ntfy.sh: if a team page shows OFFLINE, ask them to type the START code shown in the console and use "Grant access" if they get stuck.
- **A note on the secrecy:** because answers are keys, someone willing to extract `data.js` and run a guessing program could in theory try words offline. Each guess costs about 0.1 seconds of computing, which is plenty for a workshop.

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
2. Press **START GAME**. Every team's first case file opens by itself with a mission briefing. (The START code is also shown in the console as an offline fallback.)

### Team names

Teams are called Team Alpha, Bravo and so on by default. To rename them, type the new names into **Team names** at the bottom left of the console and press **Save names**. Every team page and the projector update straight away, and the names survive a reset. You can also set them at build time: `TEAM_NAMES="Cyber Owls,Null Pointers,Byte Me,Root Cause,Stack Smashers" ADMIN_PASSCODE=... node build.mjs` (in the order Alpha, Bravo, Charlie, Delta, Echo).

### 2. Each stage

Nothing to do. Teams read, solve and submit; the page checks the phrase; the next file opens. Watch the team table, the stage timers and the event log in the console. **Grant access (override)** in the selected team's panel opens the next file for a team that is stuck.

### 3. Hints

Teams buy hints themselves: a **Reveal hint** button on their page (click twice to confirm) shows the hint and takes 25% of the stage's points (a second hint takes another 25%, and a stage never drops below 25 points). The console shows the hints used and updates the score.

### 4. The vault

When a team finishes stage 5 it gets one **vault fragment** and one **recipe step**. Each team only sees its own piece, so they have to find the other teams.

1. When all five teams have finished, the console **opens the vault by itself** (or press **Open the vault** to do it earlier). Every team page jumps to a separate **Vault page** (safe, five fragment slots, the recipe pipeline and a "break the vault" box).
2. Teams join the five fragments in order 1 to 5 with no spaces, then apply the five recipe steps in order 1 to 5 in CyberChef.
3. The team that decodes the message types the **flag** (`GDG{...}`) on its vault page. A right flag opens the final message for that team at once, and the console gives the bonus in order: +200, +100, +50.
4. Press **Reveal final answer** when you want everyone, and the projector, to see it. The projector plays the reveal and every vault page shows the message and "CASE CLOSED".

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
- **A team keeps getting "ACCESS DENIED":** check the exact access phrase in the console (the selected team's panel shows it). Capitals, spaces and punctuation do not matter. If they are stuck, press **Grant access (override)**.
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
