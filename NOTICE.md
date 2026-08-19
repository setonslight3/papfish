# Third-party notices

Papfish bundles or downloads the following third-party components.

## Stockfish (GPL-3.0)

The engine is [Stockfish.js](https://github.com/nmrugg/stockfish.js), a
WebAssembly build of [Stockfish](https://github.com/official-stockfish/Stockfish),
licensed under the **GNU General Public License v3**.

It is fetched from the `stockfish` npm package at install time and served as a
standalone worker asset from `public/engine/`. If you distribute a build of
Papfish that includes the engine, the GPL applies to that distribution - keep
the engine files and this notice intact and make the corresponding source
available.

## Opening names (CC0)

Opening and variation names come from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings),
released under CC0. The raw TSV files live in `tools/pipeline/data/` and are
compiled into `apps/web/public/data/openings.json` by the pipeline.

## Opening statistics (Lichess Open Database, CC0)

Move popularity comes from the [Lichess Open Database](https://database.lichess.org/)
via the public [opening explorer](https://explorer.lichess.ovh), released under
CC0. Papfish stores only aggregated position statistics, never raw games.

## Chess rules and board

- [chess.js](https://github.com/jhlywa/chess.js) - BSD-2-Clause - move generation and legality.
- [react-chessboard](https://github.com/Clariity/react-chessboard) - MIT - board rendering, including its piece artwork.
