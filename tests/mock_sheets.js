'use strict';
// Same non-network Sheets model used by the Edge lifecycle regression.
function columnIndex(letters) {
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function createMockSheets() {
  const rows = {
    Trades: [['Timestamp', 'Symbol', 'Side', 'Event']],
    Pending: [['Trade ID', 'Timestamp', 'Symbol', 'Side']],
    'Open Positions': [['Trade ID', 'Timestamp', 'Symbol', 'Side']],
    'Closed Trades': [['Trade ID', 'Open Time', 'Close Time']],
    'Trade Metadata': [['Metadata ID', 'Trade ID', 'System']],
    'Webhook Inbox': [['Delivery ID', 'Received At', 'Event']],
    Positions: [['Trade ID']],
  };
  const ids = Object.fromEntries(Object.keys(rows).map((name, index) => [name, index + 1]));
  const namesById = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
  const controls = {
    fail_trades_append: 0,
    fail_closed_append: 0,
    fail_pending_write: 0,
    fail_webhook_complete_update: 0,
  };

  function parseRange(range) {
    const [rawSheetName, cells = 'A:Z'] = range.split('!');
    const sheetName = rawSheetName.replace(/^'|'$/g, '');
    const match = cells.match(/^([A-Z]+)(\d+)?/);
    return {
      sheetName,
      startColumn: columnIndex(match?.[1] || 'A'),
      rowNumber: match?.[2] ? Number(match[2]) : null,
    };
  }

  const spreadsheets = {
    async get() {
      return {
        data: {
          sheets: Object.entries(ids).map(([title, sheetId]) => ({
            properties: { title, sheetId },
          })),
        },
      };
    },
    async batchUpdate({ requestBody }) {
      for (const request of requestBody.requests || []) {
        const range = request.deleteDimension?.range;
        if (!range) continue;
        rows[namesById[range.sheetId]].splice(range.startIndex, range.endIndex - range.startIndex);
      }
      return { data: {} };
    },
    values: {
      async get({ range }) {
        const { sheetName } = parseRange(range);
        return { data: { values: rows[sheetName].map(row => [...row]) } };
      },
      async append({ range, requestBody }) {
        const { sheetName } = parseRange(range);
        if (sheetName === 'Trades' && controls.fail_trades_append > 0) {
          controls.fail_trades_append--;
          throw new Error('mock Trades append failure');
        }
        if (sheetName === 'Closed Trades' && controls.fail_closed_append > 0) {
          controls.fail_closed_append--;
          throw new Error('mock Closed Trades append failure');
        }
        for (const row of requestBody.values) rows[sheetName].push([...row]);
        const rowNumber = rows[sheetName].length;
        return { data: { updates: { updatedRange: `${sheetName}!A${rowNumber}:Z${rowNumber}` } } };
      },
      async update({ range, requestBody }) {
        const { sheetName, startColumn, rowNumber } = parseRange(range);
        if (sheetName === 'Trades' && controls.fail_trades_append > 0) {
          controls.fail_trades_append--;
          throw new Error('mock Trades append failure');
        }
        if (sheetName === 'Closed Trades' && controls.fail_closed_append > 0) {
          controls.fail_closed_append--;
          throw new Error('mock Closed Trades append failure');
        }
        if (sheetName === 'Pending' && controls.fail_pending_write > 0) {
          controls.fail_pending_write--;
          throw new Error('mock Pending write failure');
        }
        if (
          sheetName === 'Webhook Inbox' &&
          controls.fail_webhook_complete_update > 0 &&
          String(requestBody.values?.[0]?.[7] || '').toUpperCase() === 'COMPLETE'
        ) {
          controls.fail_webhook_complete_update--;
          throw new Error('mock Webhook Inbox COMPLETE update failure');
        }
        while (rows[sheetName].length < rowNumber) rows[sheetName].push([]);
        const target = rows[sheetName][rowNumber - 1];
        requestBody.values[0].forEach((value, index) => {
          target[startColumn + index] = value;
        });
        return { data: {} };
      },
      async batchUpdate({ requestBody }) {
        for (const update of requestBody.data || []) {
          const { sheetName, startColumn, rowNumber } = parseRange(update.range);
          const target = rows[sheetName][rowNumber - 1];
          update.values[0].forEach((value, index) => {
            target[startColumn + index] = value;
          });
        }
        return { data: {} };
      },
    },
  };

  return { spreadsheets, rows, controls };
}


module.exports = { createMockSheets };
