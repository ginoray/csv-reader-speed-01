[![Read broken CSV files faster](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ginoray/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ginoray/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# Fast Broken-CSV Reader

A dependency-free drop-in replacement for csv-reader 1.0.0, written for the make.fun bounty
[Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`run(input)` in `solve.js` returns exactly the answer csv-reader 1.0.0 returns for every input
`{text, header}` — the JSON value `{columns, rows, errors}`, with csv-reader's broken-row
policy reproduced in full: a leading U+FEFF dropped, records ending at LF or CRLF, blank lines
skipped, stray CRs dropped (`stray_cr`), quoted fields with doubled quotes and CR/CRLF read as
LF, text after a closing quote appended as it stands (`quote_junk`), a quote that never closes
read as a literal character with the rest re-read as unquoted (`unterminated_quote`), and rows
padded (`short_row`) or cut (`long_row`) to the first record's width, every error carrying the
`{code, line, row}` of the record it belongs to.

Where csv-reader builds each field a character at a time, this reader slices fields straight
out of the source text: a record whose line holds no quote and no stray CR is cut at its commas
in one go, delimiter hunts elsewhere run on `indexOf`/`charCodeAt` scans, quoted stretches are
taken as slices whenever they hold no CR, and string surgery is paid only for the rare segments
that actually contain something to repair. Same answers, much less CPU.

## Layout

- `solve.js` — the ES module exporting `run(input)`. No dependencies, no WASM.
- `main.ts` — the program the harness runs: reads every case from `/input/cases.json`, answers
  each with `run`, and writes `/output/answers.json`. It sets V8's `--no-incremental-marking`
  flag before importing `solve.js`, as the house driver does.

## License

MIT — see `LICENSE`.
