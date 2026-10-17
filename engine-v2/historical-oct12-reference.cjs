'use strict';
// Read-only reference scores transcribed from the canonical Oct 12 source-of-truth section 35.
// These are recorded historical outcomes, NOT independently recomputed scores.
// Historical reconciliation must compare them only against a separate completed review.
const reference=Object.freeze([
 ['PLTR',83,'ACTIVE'],['NVDA',74,'ACTIVE'],['DELL',77,'ACTIVE'],
 ['PANW',73,'CANDIDATE'],['AAOI',46,'CANDIDATE'],['COHR',49,'CANDIDATE'],
 ['XOM',79,'CANDIDATE'],['FTNT',73,'CANDIDATE'],
 ['AMD',66,'SCORE_EXIT'],['GLW',46,'SCORE_EXIT'],['LITE',65,'SCORE_EXIT'],
 ['MRVL',66,'SCORE_EXIT'],['TER',54,'SCORE_EXIT']
].map(([ticker,score,status])=>Object.freeze({ticker,score,status,reviewDate:'2026-10-12',basis:'VIXALE_OCT12_SOURCE_OF_TRUTH_SECTION_35'})));
module.exports={reference};
