// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly the answer csv-reader returns
// for {text, header} — {columns, rows, errors} under its broken-row policy — but gets there by
// slicing fields out of the source text instead of building them a character at a time.
//
// The policy, as the brief states it:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled: "" inside it is
//     one quote, and each CRLF or lone CR inside it is read as LF; whatever follows the closing
//     quote, up to the next comma or line break, is appended as it stands (quote_junk, reported
//     when the field ends, if anything was appended); a quote that never closes is a literal
//     character and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, untrimmed;
//   - columns is the first record when header is true, else null; rows holds the records after it
//     (every record when header is false), each padded with "" (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts
//     on, counting every LF, CRLF and lone CR inside quotes; row its record's index in rows,
//     null for the header.

// How a field ended.
const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const s = String(input.text);
  const header = input.header === true;
  const n = s.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0;    // the next character to read
  let line = 1; // the line that character is on
  if (s.charCodeAt(0) === 0xFEFF) i = 1;

  // The record being read: the line it starts on, and the index in rows it takes (null: header).
  let recLine = 1;
  let recRow = null;

  // Reads unquoted characters onto `value`, from i up to the next comma, line break or the end
  // of the text. A CR not followed by LF is dropped on the way (stray_cr). Returns
  // [value, ended, added], added counting the characters kept.
  function unquoted(value) {
    const start = i;
    let j = i;
    let strays = 0;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 44 || c === 10) break; // ',' or LF ends the field
      if (c === 13) {                  // CR
        if (s.charCodeAt(j + 1) === 10) break; // CRLF ends the field
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        strays += 1;
      }
      j += 1;
    }
    const kept = s.slice(start, j);
    value += strays === 0 ? kept : kept.split('\r').join('');
    let ended;
    if (j >= n) { ended = END; i = j; }
    else if (s.charCodeAt(j) === 44) { ended = COMMA; i = j + 1; }
    else if (s.charCodeAt(j) === 10) { ended = BREAK; i = j + 1; line += 1; }
    else { ended = BREAK; i = j + 2; line += 1; } // the CR of a CRLF
    return [value, ended, j - start - strays];
  }

  // The raw stretch s[a..b) inside a quoted field, as value text: each CRLF or lone CR in it
  // becomes one LF, and every line break it holds is counted into `line`.
  function quotedStretch(a, b) {
    const r = s.indexOf('\r', a);
    if (r === -1 || r >= b) {
      // No CR: the stretch stands as it is; only its LFs need counting.
      let p = s.indexOf('\n', a);
      while (p !== -1 && p < b) { line += 1; p = s.indexOf('\n', p + 1); }
      return s.slice(a, b);
    }
    let out = '';
    let chunk = a;
    let p = a;
    while (p < b) {
      const c = s.charCodeAt(p);
      if (c === 13) {
        out += s.slice(chunk, p) + '\n';
        line += 1;
        p += p + 1 < b && s.charCodeAt(p + 1) === 10 ? 2 : 1;
        chunk = p;
      } else {
        if (c === 10) line += 1;
        p += 1;
      }
    }
    return out + s.slice(chunk, b);
  }

  // Reads the field that opens with the quote at i. Returns [value, ended] like unquoted.
  function quoted() {
    const open = i;
    const openLine = line;
    let value = '';
    let seg = i + 1; // start of the raw stretch not yet taken into value
    let j = i + 1;   // where the hunt for the next quote resumes
    for (;;) {
      const q = s.indexOf('"', j);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read
        // again as unquoted, from just past the quote, on the line the quote opened on.
        i = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        const r = unquoted('"');
        return [r[0], r[1]];
      }
      if (s.charCodeAt(q + 1) === 34) { // a doubled quote is one quote in the value
        value += quotedStretch(seg, q) + '"';
        j = q + 2;
        seg = j;
        continue;
      }
      // The closing quote.
      value += quotedStretch(seg, q);
      i = q + 1;
      if (i >= n) return [value, END];
      const c = s.charCodeAt(i);
      if (c === 44) { i += 1; return [value, COMMA]; }
      if (c === 10) { i += 1; line += 1; return [value, BREAK]; }
      if (c === 13 && s.charCodeAt(i + 1) === 10) { i += 2; line += 1; return [value, BREAK]; }
      // Anything else follows the closing quote: it is appended as it stands.
      const r = unquoted(value);
      if (r[2] > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
      return [r[0], r[1]];
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 10) { i += 1; line += 1; }
      else if (c === 13 && s.charCodeAt(i + 1) === 10) { i += 2; line += 1; }
      else break;
    }
    if (i >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    let fields = null;
    let lastQuoted = false;

    // Fast path: the record sits on one line and that line holds no quote and no CR but the
    // CRLF's own — nothing in it can be broken, so its fields are the line cut at its commas.
    let lineEnd = s.indexOf('\n', i);
    if (lineEnd === -1) lineEnd = n;
    let segEnd = lineEnd;
    if (segEnd > i && lineEnd < n && s.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
    const qAt = s.indexOf('"', i);
    const rAt = s.indexOf('\r', i);
    if ((qAt === -1 || qAt >= lineEnd) && (rAt === -1 || rAt >= segEnd)) {
      fields = s.slice(i, segEnd).split(',');
      i = lineEnd < n ? lineEnd + 1 : n;
      if (lineEnd < n) line += 1;
    } else {
      fields = [];
      let ended = COMMA;
      do {
        if (s.charCodeAt(i) === 34) { // '"'
          lastQuoted = true;
          const r = quoted();
          fields.push(r[0]);
          ended = r[1];
        } else {
          lastQuoted = false;
          // The unquoted read, inlined: scan to the next comma or line break, dropping lone
          // CRs (stray_cr) on the way, then take the field as one slice of the text.
          const start = i;
          let j = i;
          let strays = 0;
          while (j < n) {
            const c = s.charCodeAt(j);
            if (c === 44 || c === 10) break;
            if (c === 13) {
              if (s.charCodeAt(j + 1) === 10) break;
              errors.push({ code: 'stray_cr', line: recLine, row: recRow });
              strays += 1;
            }
            j += 1;
          }
          const kept = s.slice(start, j);
          fields.push(strays === 0 ? kept : kept.split('\r').join(''));
          if (j >= n) { ended = END; i = j; }
          else if (s.charCodeAt(j) === 44) { ended = COMMA; i = j + 1; }
          else if (s.charCodeAt(j) === 10) { ended = BREAK; i = j + 1; line += 1; }
          else { ended = BREAK; i = j + 2; line += 1; }
        }
      } while (ended === COMMA);
    }

    // A line left with no characters (it held only stray CRs) is no record; its errors stay.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
