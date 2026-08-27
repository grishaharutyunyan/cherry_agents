# Game visual identity — house conventions

Read by: `design-ux` phase (`src/gemini/phases/design-ux.phase.ts`).

Like `gambling-ux-tricks.md`, this doc has two parts kept strictly
separate: **(A)** what this codebase actually does today — verified by
reading real `game-frontend/games/*` code — and **(B)** general visual-
design knowledge that is *not yet* convention here. Don't present (B)
as if it's already house style; it's a menu to draw from, and using it
sets new precedent.

## (A) What this codebase actually does

**No design-token system shared ACROSS games** — each game still gets
its own deliberate, original palette, never reused from a sibling (see
"Never reuse another game's design" in the frontend-builder's own
checklist). What changed (2026-08-28): WITHIN one game, the palette is
no longer just inline constants scattered through component files —
you now output a strict machine-readable token JSON
(`HANDOFF_<slug>_DESIGN_TOKENS.json`, alongside this doc's prose
brief), which `frontend-build` consumes into a single `theme.css` (or
`theme.ts`) file and references everywhere else via CSS variables. See
"Design tokens & animation-tier schema" below for the exact shape.
Reference games like `colorful-plinko` predate this convention and
still use scattered inline constants — that's historical, not the
pattern to follow for new games.

**Saturation and contrast.** Existing palettes lean vivid and
high-saturation — e.g. colorful-plinko's ball colors: Vivid Pink
`#ec4899`, Neon Cyan `#06b6d4`, Vivid Emerald `#10b981`, Bright Amber
`#f59e0b`, Electric Violet `#8b5cf6`, Rose Coral `#f43f5e`, Bright
Sapphire `#3b82f6`, Crimson Flare `#e11d48` — paired with dark
backgrounds (slate/near-black gradients, e.g. `#334155` → `#1e293b`
for a neutral/idle state). Favor this "neon on dark" register unless
the game's own theme genuinely calls for something else (e.g. a
bright daylight theme) — call out the deviation explicitly if you take
it, the same way `gambling-ux-tricks.md` asks for new-precedent calls
to be flagged.

**Risk/outcome color-coding.** Where a game has a risk or outcome
axis (colorful-plinko's low/medium/high risk tiers), each tier gets
its own two-color gradient rather than a single flat color — keep this
pattern for any game with an analogous axis (bet size, multiplier
tier, danger level).

**No shared thumbnail/icon style guide exists yet** beyond what the
finalize step's thumbnail-prompt template already says (bold saturated
colors, high-contrast central subject, subtle glossy/neon highlights,
no baked-in text, clean silhouette at small size). Your visual anchor
should be specific enough that a thumbnail generated from it would
look like it belongs next to the games named above, not generic.

## Design tokens & animation-tier schema ("the Juice")

The design-tokens JSON you write must match this shape exactly — QA and `frontend-build` both
parse it programmatically, so field names and types are load-bearing, not stylistic choices:

```json
{
  "colorTokens": {
    "main_bg": "#1A0D2F", "surface": "#2A1B45", "accent": "#FF00E5", "text_primary": "#F5F0FF",
    "win_glow": "#FFF800", "loss_dim": "#4A3B5C", "multiplier_hot": "#FF4B4B", "multiplier_cold": "#4B9FFF"
  },
  "animationTiers": [
    { "id": "base", "minMultiplier": 1, "maxMultiplier": 3, "effects": ["scalePulse"], "counterDurationMs": 400 },
    { "id": "big", "minMultiplier": 3, "maxMultiplier": 10, "effects": ["screenShake", "particleBurst"], "counterDurationMs": 1500 },
    { "id": "mega", "minMultiplier": 10, "maxMultiplier": null, "effects": ["screenDim", "particleFountain", "colorStrobe"], "counterDurationMs": 3500 }
  ]
}
```

- Always exactly three tiers, ids `base`/`big`/`mega`, in that order. Boundaries are NOT fixed —
  derive them from this specific game's real multiplier range in the spec doc, so a low-max-win
  game doesn't ship an unreachable "mega" tier and a high-max-win game doesn't trigger it on
  every other round.
- `effects` are free-text labels, not function names — there's still no shared animation
  library (see (A) above and `gambling-ux-tricks.md`'s Animation section); `frontend-build`
  writes bespoke effect code per tier, per game.
- QA mechanically checks two things against this file: no hardcoded hex/rgb outside
  `theme.css`/`theme.ts` (`lint_hardcoded_colors` tool), and each tier has a real conditional
  with real code in it (structural presence, not quality). `lead_review` is the one that judges
  whether the effect code inside each tier actually matches the tone this brief describes.

## (B) General visual-identity knowledge (not yet house convention)

Use these as a menu, not a checklist — most games so far use none of
this beyond what's in (A):

- **A single "hero color" plus one accent** reads cleaner at small
  sizes (game icons, list rows) than a five-color palette — reserve
  the full palette for in-game moments (wins, particle effects), and
  pick one or two colors that dominate the thumbnail/icon.
- **Motion as identity, not just feedback.** A theme can be expressed
  through *how* things move (snappy vs. floaty vs. weighty) as much as
  through color — if you propose a signature motion idea in the UI
  layout notes section, keep it implementable as a plain
  `requestAnimationFrame` state update (see `gambling-ux-tricks.md`'s
  Animation section — no tweening/easing library exists in this
  codebase).
- **Theme-mechanic coherence** — the strongest visual anchors tie
  directly to what the player is actually doing (e.g. a card game's
  theme should inform how the deck itself looks, not just the
  background chrome around it).
