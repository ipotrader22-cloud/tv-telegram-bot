# ADR: Native Swing writer lease and revision fencing

Status: accepted for cooperating scheduled model writers, October 12, 2026.

Context: independent scheduled research/recovery/target jobs could commit stale overlapping payloads. Writer windows and readback alone did not provide atomic conditional mutation. A new server, API credentials and paid resources are unnecessary for this limited coordination primitive.

Decision: use spreadsheet-scoped DOCUMENT developerMetadata with a fixed-ID short lease and persistent revision fence. All participating commits must include both conditional guards in the same native batch as their payload. The live API proof exercised wrong and correct expected values; an actual service-note commit then used the protocol and released its lease. This does not make analyst scoring deterministic or promise scheduler timing.

## Native atomic lease and revision guard (mandatory for every scheduled writer)
This was live-tested against service metadata on October12: wrong expected value caused HTTP400 duplicate-ID rejection and rolled back the whole batch; correct expected value allowed delete/recreate in the same atomic batch. Disposable test records were removed. Production fence ID1030101 is initialized; lease ID1030100 is FREE. No trading cells were changed by the lock test.

Use Google Sheets developerMetadata at spreadsheet scope, visibility DOCUMENT:
- Lease metadataId1030100, metadataKey VIXALE_SWING_LEASE_V1, metadataValue a compact JSON string containing task/run owner, unique nonce and UTC expiresAt. TTL120 seconds. Keep exact serialized value.
- Persistent fence metadataId1030101, metadataKey VIXALE_SWING_FENCE_V1, metadataValue unique revision token. This record MUST exist and must never be reset/deleted outside its guarded replacement.
- Require exactly one fence and at most one lease with these IDs/keys. Conflicting IDs/keys, invalid expiry or unsupported raw batch means BLOCKED/no financial writes.

Read metadata with the spreadsheet resource (include developerMetadata). If the connector metadata helper omits it, the tested connector-compatible readback is a no-match request:
{"updateDeveloperMetadata":{"dataFilters":[{"developerMetadataLookup":{"metadataKey":"VIXALE_METADATA_READ_NO_MATCH_20261012_1635"}}],"developerMetadata":{"metadataValue":"read-only-no-match"},"fields":"metadataValue"}}
Set include_spreadsheet_in_response=true and response_include_grid_data=false; inspect updatedSpreadsheet.developerMetadata. The reserved no-match key must not be created. This changes no matching records.

Acquire a FREE lease by a native batch containing:
{"createDeveloperMetadata":{"developerMetadata":{"metadataId":1030100,"metadataKey":"VIXALE_SWING_LEASE_V1","metadataValue":"EXACT_NEW_LEASE_JSON","location":{"spreadsheet":true},"visibility":"DOCUMENT"}}}
Duplicate ID means another writer owns it: defer/retry only within your window. Do NOT omit the lock. If an observed lease is expired, reclaim with one batch: delete its EXACT key/value, then create SAME lease ID with your new owner value. Do not delete unexpired or invalid leases.

After successful acquisition, read fresh exact lots, all closed rows including Q=NO, affected formulas/ranges and EXACT current fence. Build all financial requests from this fresh state. Immediately before committing recheck clock/window and quote timeliness. If lease has expired, reacquire and reread from scratch.

Every financial commit is ONE native batch, in this order:
1. {"deleteDeveloperMetadata":{"dataFilter":{"developerMetadataLookup":{"metadataKey":"VIXALE_SWING_FENCE_V1","metadataValue":"EXACT_OBSERVED_FENCE_VALUE"}}}}
2. {"createDeveloperMetadata":{"developerMetadata":{"metadataId":1030101,"metadataKey":"VIXALE_SWING_FENCE_V1","metadataValue":"NEW_UNIQUE_REVISION","location":{"spreadsheet":true},"visibility":"DOCUMENT"}}}
3. {"deleteDeveloperMetadata":{"dataFilter":{"developerMetadataLookup":{"metadataKey":"VIXALE_SWING_LEASE_V1","metadataValue":"EXACT_OWNED_LEASE_JSON"}}}}
4. {"createDeveloperMetadata":{"developerMetadata":{"metadataId":1030100,"metadataKey":"VIXALE_SWING_LEASE_V1","metadataValue":"EXACT_REFRESHED_OWNED_LEASE_JSON","location":{"spreadsheet":true},"visibility":"DOCUMENT"}}}
5. All related portfolio/ledger/feed/equity requests in the same batch, after guards.

If either expected value changed, its delete matches nothing and the fixed-ID create fails, rolling back all financial requests. Never split guards from financial writes. Never use metadataId in delete lookup as a substitute for exact key/value matching. Do not use unguarded value updates. A successful commit advances your observed fence and lease values; a second commit requires fresh readback. Release only by delete lookup on EXACT owned lease key/value after readback; never touch another owner's lease. Persistent fence remains when free.

On timeout/unknown outcome inspect fence, lease, exact lots and all ledger/feed/history layers before any retry. A committed revision is reconciled, not repeated. On conflict read fresh and restart or defer; never reuse stale payload. This protects cooperating scheduled writers, not arbitrary manual writers that ignore the protocol. No server/credentials/payment resource was added. Research, production checks and emails occur outside the short lease.

Reference: Google Sheets batchUpdate guarantees atomic ordered requests; unique explicit metadata IDs and DOCUMENT visibility are documented by Google:
https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.developerMetadata


