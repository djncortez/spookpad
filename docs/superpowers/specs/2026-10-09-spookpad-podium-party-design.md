# SpookPad: Kings of the Graveyard podium, launch party and sharing

Date: 2026-10-09. Status: approved in conversation. Builds on the redesign and intro specs of the same date.

## Goal

Two things that pull traders in: a podium of the coins with the highest live market cap (winners attract launches),
and a celebration with one-tap sharing after a launch (every launch advertises SpookPad).

## 1. Kings of the Graveyard

- **Where:** at the top of the Graveyard section (`components/Graveyard.tsx`), above the sort tabs and grid. It uses
  the coins and caps the Graveyard already loads (60 newest coins, caps every 15 s): no new requests.
- **Who:** the three coins with the highest known market cap (coins without a cap are left out), from the pure
  function `podium(coins, caps)` in `lib/podium.ts`. With fewer than three, the podium shows what there is; with
  none, it is not shown.
- **Layout:** 1st in the middle and tallest, 2nd on the left, 3rd on the right, on three columns at every width
  (smaller on phones). Each spot: the costumed picture, name, `$TICKER`, market cap, and a rank plinth with a
  gold, silver or bronze glow; a drawn SVG crown sits on 1st (no emoji). Each spot links to the coin page.
- **Live:** when a coin's cap changes between reads, its number flashes green with "▲" if it went up or red with
  "▼" if it went down, for 2 s (`trend(previous, next)` in `lib/podium.ts`). No flash under reduced motion; the
  arrow still shows.

## 2. Launch party

- **Trigger:** after a successful launch, LaunchWizard already opens `/coin/?mint=<mint>`. It now opens
  `/coin/?mint=<mint>&party=1` (both places it does so). The coin page shows the party once the coin has loaded and
  removes `party=1` from the address straight away (`history.replaceState`), so a reload or a shared link never
  replays it.
- **The party:** a dialog over the coin page (`role="dialog"`, `aria-modal`, focus moves to it, Escape and Close
  close it):
  - a one-off burst of orange and purple sparks with a few bat silhouettes (canvas, about 1.8 s; skipped under
    reduced motion);
  - "It's alive!", the costumed picture, the name and `$TICKER`, "dressed as a <costume>";
  - the share buttons below.

## 3. Sharing

Shared by the party and every coin page (`components/ShareButtons.tsx`); the text and links come from pure functions
in `lib/share.ts`.

- **Share on X:** opens `https://x.com/intent/post?text=…&url=…` in a new tab. Text:
  "<Name> ($TICKER) just rose from the grave dressed as a <Costume>. Launched on spookpad.netlify.app", URL: the
  coin's pump.fun page. On a phone that can share files (`navigator.canShare({ files })`), the same button opens the
  phone's share sheet instead, with the card image attached and the same text and link.
- **Download card:** a 1200 x 675 PNG drawn in a canvas (`lib/share-card.ts`): dark purple background with a pumpkin
  glow, the costumed picture on the left, and on the right the name (Creepster), `$TICKER`, "dressed as a
  <Costume>", "Launched on SpookPad", and "spookpad.netlify.app" at the bottom. The art is loaded with
  `crossOrigin = "anonymous"`; Supabase Storage answers `access-control-allow-origin: *` (checked). If the canvas
  still cannot be exported, the button hides.
- **Copy link:** copies the coin's SpookPad page link (`https://spookpad.netlify.app/coin/?mint=…`, from the current
  origin).
- Every coin page gets the Share on X button next to Trade on pump.fun; Download card and Copy link sit in the party.

## Unchanged

Payments, launches, the market-cap engines and data; the only launch-flow change is the `party=1` flag on the
redirect.

## Testing

- Unit tests: `podium` (order, top three only, coins without caps left out, fewer than three, ties stable),
  `trend` (up, down, unchanged, unknown), `shareText`, `xIntentUrl` (encoding), `coinPageUrl`, `partyUrl`.
- The suite, typecheck, lint, build and `check-initial-js.mjs` pass.
- Browser, desktop and 375 px, against a build with the live public settings: the podium with real coins; the party
  opened with `&party=1` (burst, dialog, Escape closes, the address loses `party=1`); Download card saves a PNG;
  Share on X opens the intent URL; reduced motion: no burst, no flash.
