# iCrack

Six games for the iPhone Duo's Green Line of Death. The line is treated as
hardware: it never moves, flickers or goes away, and every game is built
around it. On a Duo with the defect, the games play on the real line (after a
quick calibration). Everywhere else the line is drawn in the same place.

Home screen order:

- Line Clear: falling blocks. The line is a shelf and a wall inside the well,
  and it's the one line you can't clear.
- Walk the Line: Speck, a grain of sand in your hinge, walks the line. Tap to
  jump dead pixels and $1,000 repair bills. An iFixit kit fixes the next one
  for free.
- Hangman: the L is already a gallows. Every wrong letter adds a green line.
- Pinball: the hinge line is a wall, the line across is a trampoline, and the
  sealed corner is the score display.
- Green Line: a metro line. Hold to go, let go to brake, stop on the mark.
  One hold and one release per stop; a first go that was only a tap is
  forgiven once.
- Buzz Wire: steer a ring along the line without touching it.

Not affiliated with Apple, iFixit or JerryRigEverything (it says so in Settings).

Static site, no build step: `index.html`, `js/core.js` (screen, line,
calibration, menus, input, sound) and one file per game in `js/`.

## Run locally

    python3 -m http.server 8000

Open http://localhost:8000. The iPhone Duo simulator in Xcode can open it too:

    xcrun simctl openurl booted http://localhost:8000

Web Share needs HTTPS, so Share only works once deployed.

## Deploy

GitHub Pages serves the `main` branch of https://github.com/Shimku/icrack at
https://icrack.io (the `CNAME` file holds the domain). Pushing to `main`
publishes.

- Bump the `?v=` on the script tags in `index.html` when the JS changes, so
  browsers that cached the old files pick up the new ones.
- `og:url` and `og:image` in `index.html` assume https://icrack.io/.
- `?g=pinball` (or any game id) opens a game directly.
- DNS is at Spaceship: four A records and four AAAA records on `@` for GitHub
  Pages, and `www` as a CNAME to `shimku.github.io`.

## Add to Home Screen

iOS has no install prompt a page can trigger. In a Safari tab on a phone the
home screen shows an Add to Home Screen button (Settings has one too) that
opens the two taps: Share, then Add to Home Screen. Chrome and Edge fire
`beforeinstallprompt`, and the same button opens their real prompt. The button
is hidden once it runs from the Home Screen. `?install=ios` fakes a Safari tab
for testing.

## Where the line goes

- Landscape default: corner at 49% across, 60% down, measured off owner
  photos. Units vary by a few percent.
- In a Safari tab on the Duo the toolbars sit across the top (126 of 669 pt),
  so the default is moved up to land on the panel's real line. `screen.*`
  reports the cover screen there, so it is measured with `outerHeight`.
- Settings, I have the real line: drag the pink guide onto the real line, then
  switch the drawn line off. Saved per orientation in localStorage.

## Tests

Each game has a selftest, run headless in Edge (there's no Chrome or node on
this Mac):

    E="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    "$E" --headless=new --window-size=874,402 --virtual-time-budget=60000 --dump-dom "file://$PWD/index.html?game=walk&selftest=20&frame=0" | grep -o 'SELFTEST[^<]*'

- walk: replays every death and searches tap timings; `unfair` must be 0.
- hangman: word list, keyboard on screen and off the line, round logic.
- blocks: shelf and sealed-corner clear rules, long autopilot games.
- pinball: autopilot games end, the ball never leaves the table or enters
  the sealed corner.
- metro: autopilot completes a shift; a forgiven first tap costs nothing;
  nudging with lots of little taps scores far below one hold and one release;
  platforms don't overlap or sit on the corner.
- buzz: the exact path never buzzes, leaving the wire or flicking over it does.

Other hooks: `?game=x&sim=20&bot=1` plays 20 s on autopilot then freezes,
`?screen=settings|calib|info|install`, `?shot=og|icon`, `?frame=0|1` forces phone or desktop.

Regenerate the images:

    "$E" --headless=new --hide-scrollbars --window-size=1200,630 --virtual-time-budget=2500 --screenshot=$PWD/og.png "file://$PWD/index.html?shot=og"
    "$E" --headless=new --hide-scrollbars --window-size=512,512 --virtual-time-budget=2500 --screenshot=$PWD/icon-512.png "file://$PWD/index.html?shot=icon"
    sips -z 180 180 icon-512.png --out icon-180.png
