/**
 * KanoFood reporting web app. Google Apps Script, bound to the operations sheet.
 *
 * The application posts order and settlement rows here over HTTPS instead of
 * talking to the Sheets API. This script holds the spreadsheet permission, so the
 * deployment needs no OAuth grant, no refresh token and no spreadsheet id; it
 * needs one URL and one shared token. docs/ARCHITECTURE.md section 12.
 *
 * ---------------------------------------------------------------------------
 * DEPLOY, once, in this order
 * ---------------------------------------------------------------------------
 *
 * 1. Open the operations spreadsheet. Extensions -> Apps Script. That creates a
 *    script bound to this document, which is what makes `getActiveSpreadsheet`
 *    below resolve to it.
 * 2. Replace the contents of Code.gs with this file.
 * 3. Set TOKEN to the same value as SHEETS_WEBHOOK_TOKEN in the application's
 *    environment. Nothing in this repository contains that value.
 * 4. Deploy -> New deployment -> Select type -> Web app.
 *      Description:        anything you will recognise later.
 *      Execute as:         Me. The script acts for the account that owns the
 *                          sheet, which is the whole point: no other account
 *                          needs Sheets permission.
 *      Who has access:     Anyone. Apps Script has no notion of a per-caller
 *                          credential, so "Anyone" plus TOKEN is the access
 *                          control: without the token, every request is refused
 *                          before a sheet is touched.
 * 5. Copy the deployment's /exec URL into SHEETS_WEBHOOK_URL and set
 *    SHEETS_SYNC_ENABLED=true.
 * 6. After any later edit to this file: Deploy -> Manage deployments -> edit the
 *    existing deployment -> Version: New version -> Deploy. Saving the script
 *    changes nothing about what the /exec URL runs, and forgetting this is the
 *    most common way a working change appears not to work.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------
 *
 * One POST carries `{ kind, rows }`, where kind is "order" or "settlement".
 * Every row has a stable `key` (`order:<uuid>` or `settlement:<uuid>`), and this
 * script upserts on it: an existing key is rewritten in place, an unknown key is
 * appended. A retry, a resync of a whole month, or the same order written again
 * on a later move therefore cannot produce a second row. That is the entire
 * reason the key exists.
 *
 * The `Orders` and `Settlements` sheets are created on first use with their
 * header row. An existing header is the authority: columns are added to it when
 * the application starts sending a new one, and nothing is ever removed or
 * reordered, so an operator's own formulas and pivots keep working.
 *
 * It answers JSON from ContentService. Apps Script web apps always answer 200,
 * so `{ "ok": false }` is how a refusal is signalled and the application treats
 * anything but `ok: true` as a failure worth logging.
 */

/**
 * The shared secret. MUST equal SHEETS_WEBHOOK_TOKEN in the application.
 * Left as the placeholder below, every request is refused: an unset secret is
 * not the same as no secret.
 */
var TOKEN = "PASTE_THE_SAME_VALUE_AS_SHEETS_WEBHOOK_TOKEN";

var TOKEN_PLACEHOLDER = "PASTE_THE_SAME_VALUE_AS_SHEETS_WEBHOOK_TOKEN";

/** Sheet name per kind. Changing one here is a new sheet in the document. */
var SHEETS = { order: "Orders", settlement: "Settlements" };

/**
 * Header order for a new sheet. These are the columns the application sends; if
 * it ever sends one that is not listed here, it is appended to the header rather
 * than dropped, so a new field is a column and not a code change.
 */
var COLUMNS = {
  order: [
    "key",
    "order_number",
    "kitchen",
    "status",
    "created_at",
    "subtotal_kobo",
    "delivery_fee_kobo",
    "total_kobo",
    "payment_method",
    "payment_status",
    "delivery_area",
    "rider",
  ],
  settlement: [
    "key",
    "kitchen",
    "period_start",
    "period_end",
    "gross_kobo",
    "commission_kobo",
    "net_payable_kobo",
    "model",
    "status",
    "paid_at",
  ],
};

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    var body = parseBody(e);

    // The token is checked before anything else and before any sheet is opened,
    // so an unauthenticated caller learns nothing and costs nothing.
    if (TOKEN === "" || TOKEN === TOKEN_PLACEHOLDER) {
      return answer({ ok: false, error: "This deployment has no token set." });
    }
    if (!body || !sameToken(tokenFrom(e, body))) {
      return answer({ ok: false, error: "unauthorised" });
    }

    var kind = body.kind;
    if (!Object.prototype.hasOwnProperty.call(SHEETS, kind)) {
      return answer({ ok: false, error: "Unknown kind." });
    }
    var rows = body.rows;
    if (!rows || !rows.length) {
      return answer({ ok: false, error: "No rows." });
    }

    // Two requests at once would both read the same key column and both append,
    // which is exactly the duplicate the key exists to prevent. The lock is a
    // mutual exclusion around read-decide-write, not a queue: the application
    // has a 10 second timeout, so waiting longer than 30 seconds helps nobody.
    if (!lock.tryLock(30000)) {
      return answer({ ok: false, error: "Busy. Try again." });
    }

    var written = upsert(kind, rows);
    return answer({ ok: true, kind: kind, rows: written });
  } catch (error) {
    return answer({ ok: false, error: String((error && error.message) || error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // Never held. Nothing to release.
    }
  }
}

/**
 * A GET is a person opening the /exec URL in a browser, not the application.
 * Answering something explicit stops that being mistaken for an empty report.
 */
function doGet() {
  return answer({
    ok: false,
    error: "This web app accepts POST from the KanoFood application only.",
  });
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    return JSON.parse(e.postData.contents);
  } catch (ignored) {
    return null;
  }
}

/**
 * Where the token arrived.
 *
 * `e.headers` is not part of Apps Script's documented event object, so a header
 * that arrives is used and a header that does not is not depended on: the
 * application sends the token in the `x-sheets-token` header and in the body, and
 * either one is enough. The body copy is the one guaranteed to reach a web app.
 */
function tokenFrom(e, body) {
  var headers = (e && e.headers) || {};
  var header = headers["x-sheets-token"] || headers["X-Sheets-Token"];
  if (typeof header === "string" && header !== "") return header;
  return body && typeof body.token === "string" ? body.token : "";
}

/**
 * Compare without returning early on the first wrong character, so the time taken
 * says nothing about how much of the token was right. Length is compared first,
 * which leaks only the length of a secret the caller already has to guess.
 */
function sameToken(candidate) {
  if (typeof candidate !== "string" || candidate.length !== TOKEN.length) return false;

  var difference = 0;
  for (var index = 0; index < TOKEN.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ TOKEN.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Write every row, updating by key. Returns how many were written.
 *
 * The key column is read once per request rather than searched per row: a resync
 * batch is hundreds of rows, and `indexOf` over a growing array for each is the
 * shape that makes a script time out.
 */
function upsert(kind, rows) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var name = SHEETS[kind];
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

  var columns = ensureHeader(sheet, kind, rows);
  var keyColumn = columns.indexOf("key");
  if (keyColumn === -1) {
    throw new Error('The "' + name + '" sheet has no "key" column, so rows cannot be upserted.');
  }

  var lastRow = sheet.getLastRow();
  var existing = {};
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, keyColumn + 1, lastRow - 1, 1).getValues();
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index][0];
      if (key) existing[String(key)] = index + 2;
    }
  }

  var written = 0;
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex];
    if (!row || typeof row.key !== "string" || row.key === "") continue;

    var values = [];
    for (var column = 0; column < columns.length; column += 1) {
      var value = row[columns[column]];
      // Blank rather than absent: an empty cell and a missing cell mean the same
      // thing in a sheet, and "" writes without a trip through JSON.
      values.push(value === undefined || value === null ? "" : value);
    }

    var at = existing[row.key];
    if (at) {
      // The row moves on: an order written at confirmation is rewritten at
      // delivery, and the key is what keeps that one row.
      sheet.getRange(at, 1, 1, values.length).setValues([values]);
    } else {
      at = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(at, 1, 1, values.length).setValues([values]);
      existing[row.key] = at;
    }
    written += 1;
  }

  return written;
}

/**
 * The header row, and the column order every row is written in.
 *
 * A sheet that already has a header is not rewritten. Anything the application
 * now sends that is not in it is appended to the right of the existing columns,
 * so a new field arrives as a new column while an operator's formulas, formatting
 * and pivots keep pointing at the columns they always did.
 */
function ensureHeader(sheet, kind, rows) {
  var wanted = COLUMNS[kind].slice();

  // Any column the application sends that this file has not been told about yet.
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    var row = rows[rowIndex] || {};
    for (var field in row) {
      if (
        Object.prototype.hasOwnProperty.call(row, field) &&
        wanted.indexOf(field) === -1
      ) {
        wanted.push(field);
      }
    }
  }

  var width = sheet.getLastColumn();
  var header = width > 0 ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  var names = [];
  for (var index = 0; index < header.length; index += 1) {
    names.push(header[index] === null || header[index] === undefined ? "" : String(header[index]));
  }

  var named = names.filter(function (value) {
    return value !== "";
  });

  // An empty first row is a sheet with no header, not a header of empty strings.
  if (named.length === 0) {
    sheet.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return wanted;
  }

  var additions = [];
  for (var wantedIndex = 0; wantedIndex < wanted.length; wantedIndex += 1) {
    if (named.indexOf(wanted[wantedIndex]) === -1) additions.push(wanted[wantedIndex]);
  }

  if (additions.length > 0) {
    sheet.getRange(1, names.length + 1, 1, additions.length).setValues([additions]);
    names = names.concat(additions);
  }

  return names;
}

function answer(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
