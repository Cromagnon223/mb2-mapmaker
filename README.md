# mb2-mapmaker

A map maker for [Movie Battles 2](https://www.moviebattles.org/), the mod for Star Wars Jedi Knight: Jedi Academy.

## Open it

The editor runs in the browser: https://claude.ai/artifact/WRx6ag5RDT7bhY6qYNc6Zq

## What it does

- Paint rooms from above on a 64-unit grid; pick a look (Imperial, Rebel, Desert, Jedi temple, Snow), floor height, ceiling and open sky. Raise/Lower tools make steps and platforms.
- Place Rebel and Imperial start points (or press **Place for me**); each team is topped up to 16 automatically.
- **3D** and **Walk around** views show the compiled map itself, with its textures and baked lighting.
- A **Check** list with one-click fixes.
- **Download playable map** compiles the level in the browser and saves `<name>.zip` holding `<name>.pk3` (bsp, .siege, .arena, textures, sky, levelshot). Drop the pk3 in `GameData/MBII` and run `/map <name>`.
- More menu: blank/example map, save/open project (.json), Radiant `.map` export.

## Files

- `editor/index.html` – the editor page (published as the link above).
- `editor/mapgen.js` – grid to brushes, entities, `.map`, `.arena`, `.siege`.
- `editor/bsp.js` – in-browser compiler to a Jedi Academy RBSP `.bsp` (BSP tree, collision brushes, faces, vertex lighting).
- `editor/textures.js` – procedural textures and sky shipped inside the pk3.
- Tests: `node tests/mapgen.test.js && node tests/bsp.test.js` (the bsp test re-reads the file and checks collision against the layout). The compiled sample map also loads on an OpenJK dedicated server.

## MB2 specifics

Team spawns are `info_player_siegeteam1` (Rebels) and `info_player_siegeteam2` (Imperials), with a `.siege` file and an `.arena` of type `"MB"`, per the MB2 community mapping threads. The `.siege` team names (`DeathStar_Rebels` / `DeathStar_Imperials`) follow the forum example and have not been checked in-game yet.
