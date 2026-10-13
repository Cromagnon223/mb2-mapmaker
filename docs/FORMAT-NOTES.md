# Format facts ledger

Every fact the compiler (`editor/bsp.js`) or the map writer (`editor/mapgen.js`) relies on goes here, marked
**confirmed** (with the engine source line, data, or a run that proves it) or **inferred** (a guess; say what would confirm it).
Read this before changing the compiler; add a line when you learn something. A check that only confirms what we already do
still earns a line: it turns "inferred" into "confirmed" so the next agent doesn't re-check it.

Engine source: OpenJK `codemp/qcommon/qfiles.h` (rev 260c59c). `tools/openjk-server.sh` keeps a copy in `.cache/openjk-src`.

## RBSP v1 (Jedi Academy multiplayer)

| Fact | Status | Source |
|---|---|---|
| Header ident `RBSP`, version 1 | confirmed | qfiles.h:307-309 |
| Lump order 0 entities ... 17 lightarray (18 lumps) | confirmed | qfiles.h `LUMP_*` |
| Record sizes: shader 72, plane 16, node 36, leaf 48, model 40, brush 12, brushside 12, drawvert 80 (`mapVert_t`, 4 lightmap st + 4 colors), surface 148, lightgrid 30 | confirmed | `sizeof` of the qfiles.h structs, compiled 2026-10-13; match `tests/bsp.test.js` SIZES |
| Leafsurface, leafbrush, drawindex records are 4-byte ints; lightarray entries 2 bytes | confirmed by run | the server loads them without error (`tools/loadtest.sh`); field layout not yet read from cm_load.c |
| Limits: 0x400 shaders and models, 0x8000 brushes, 0x20000 planes/nodes/leafs/brushsides/draw surfaces, 0x80000 draw verts and indexes | confirmed | qfiles.h:314-336 |
| A compiled sample map loads in a real OpenJK dedicated server (CM_LoadMap, InitGame, clean exit) | confirmed by run | `tools/loadtest.sh` (CI runs it) |
| The map renders correctly on a real client | inferred | needs a client run with base assets |
| MB2 siege/`.siege` UseTeam names | inferred | needs MB2's own map files |
