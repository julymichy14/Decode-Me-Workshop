# Decode Me If You Can: The Vault (static / GitHub Pages)

1. `ADMIN_PASSCODE=yourpass node build.mjs` creates `data.js` (all locked content AES-encrypted). Re-run only before the event; every run makes new codes.
2. Commit `index.html app.js style.css data.js`. Keep `challenges.json` out of the repo (it is in .gitignore).
3. Enable GitHub Pages (Settings, Pages, deploy from branch, root).
4. Open `#/admin` on the host laptop and enter the passcode. It lists the team join codes. Print them.
5. Open `#/screen` in a second window on the same laptop and put it on the projector. It syncs through localStorage.

Flow: Start game, then read out the START code. After a team shows its code word, press VERIFY and read out the code the console shows.
Hints work the same way.
