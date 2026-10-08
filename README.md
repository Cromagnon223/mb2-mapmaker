# mb2-mapmaker

A map maker for [Movie Battles 2](https://www.moviebattles.org/), the mod for Star Wars Jedi Knight: Jedi Academy.

## Open it

The editor runs in the browser: https://claude.ai/artifact/WRx6ag5RDT7bhY6qYNc6Zq

## What it does

- Paint rooms from above on a 64-unit grid. Each room has a floor height, ceiling height, look (texture set) and an optional open sky.
- Place Imperial, Rebel and free-for-all spawns and lights; set which way spawns face.
- A 3D preview and a "Ready to play?" checklist (spawns per team, rooms too low, spawns stuck in walls).
- **Export for Radiant** saves `<name>.zip` with `maps/<name>.map` (sealed, leak-free brushes) and `scripts/<name>.arena`.
- Work autosaves in the browser; Save/Open project uses a `.json` file.

The `.map` still needs one compile in Radiant (Build > BSP) to become a playable `.bsp`; the zip's README lists the steps.

## Files

- `editor/index.html` – the editor page (published as the link above).
- `editor/mapgen.js` – turns the grid into `.map` / `.arena` text. Tested by `node tests/mapgen.test.js`.

## Known guesses

- MB2 team spawn class names (`info_player_imperial`, `info_player_rebel`) and the default texture paths are best guesses; CTF backup spawns are added by default, and every texture name can be changed in the editor (Export > Textures).
