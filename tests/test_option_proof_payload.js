const assert = require('assert');
const { __test } = require('../app');

const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const decoded = __test.decodeOptionProofPayload({
  file_name: 'broker-proof.jpg',
  mime_type: 'image/jpeg',
  data_base64: tinyJpeg.toString('base64'),
});
assert.strictEqual(decoded.mimeType, 'image/jpeg');
assert.strictEqual(decoded.fileName, 'broker-proof.jpg');
assert.deepStrictEqual(decoded.buffer, tinyJpeg);
assert.strictEqual(__test.optionProofMagicMatches(tinyJpeg, 'image/jpeg'), true);
assert.strictEqual(__test.optionProofMagicMatches(Buffer.from('not-an-image'), 'image/jpeg'), false);

assert.throws(() => __test.decodeOptionProofPayload({
  file_name: 'bad.jpg',
  mime_type: 'image/jpeg',
  data_base64: Buffer.from('not-an-image').toString('base64'),
}), /signature/i);

const trades = [{ id: 'trade-a' }, { id: 'trade-b' }];
const proofs = [
  { id: 'proof-2', trade_id: 'trade-a', uploaded_at: '2026-08-02T12:00:00.000Z' },
  { id: 'proof-1', trade_id: 'trade-a', uploaded_at: '2026-08-01T12:00:00.000Z' },
];
const attached = __test.attachOptionProofs(trades, proofs);
assert.deepStrictEqual(attached[0].proofs.map(p => p.id), ['proof-1', 'proof-2']);
assert.deepStrictEqual(attached[1].proofs, []);

console.log('Option proof payload tests passed.');
