# VIXALE Active Portfolio — prospective entry allocation amendment

Owner instruction: November 13, 2026, after the regular session.
Effective first new model decision: November 16, 2026.
This amendment supersedes earlier entry restrictions only. The FINAL October 12
Source of Truth and subsequent deployed Engine 2 operating contracts continue
to govern all other behavior.

- A verified current nine-factor score **strictly above 70** is the sole entry
  signal. No 80-point floor, compelling-entry exception, breakout/near-high,
  relative-volume confirmation, catalyst event or discretionary approval remains.
- Fill available slots in descending score order; ticker order resolves ties.
  Maximum ten simultaneous positions, each a fixed normalized $10,000 allocation,
  for up to $100,000 gross model allocation. Insufficient qualifying candidates
  leave slots empty; never lower the threshold or invent a candidate.
- Keep existing eligible holdings; score 70 may remain held under the unchanged
  below-70 exit rule, but cannot initiate a new entry. No forced replacement of
  an existing holding merely because a candidate has a higher score.
- Realized losses do not reduce the ten-slot limit. Preserve every loss, model
  equity and the original formula-driven cash calculation. At full fixed gross
  allocation, that normalized residual cash can be negative after realized losses;
  this is model accounting, not broker leverage or an instruction to borrow.
- Previously closed tickers may qualify again as **new dated lots**. Preserve all
  original closed lots (including Q=NO) and immutable history. Same-session exits
  and already-used same-date lot IDs cannot be immediately recycled.
- Promote qualifying candidates in the same model transaction that publishes the
  current review, instead of holding them for another technical signal. The
  current producer generates one verified pre-open batch and commits at the
  existing 10:00 ET market review. This amendment adds no intraday rescoring or
  after-hours model fills; market-calendar, valid regular-session price,
  full research, atomicity/idempotency and publication proofs remain mandatory.
- Existing 518-stock universe, nine factor weights/scoring, TP/SL/dropout rules,
  $10K return accounting, Q/R controls, formula-driven sections, immutable equity
  history, website refresh/deployment and email settings remain unchanged.

Implementation: `engine-v2/entry-allocation-policy.cjs` centralizes the prospective
date boundary. Earlier delayed commits are recomputed with their original
selection rules on every historical read; never reinterpret their evidence under
the new rule. First-day, ongoing, delayed/Google decision paths, assessment,
compiler and quote selection use the same prospective entry policy.

Deploy the reviewed PR into `engine-v2-shadow-foundation-20261016`, the actual
Render financial writer/observer source. The production website on `main` already
reads this writer's Engine 2 workbook; do not merge the entire Engine 2 development
branch into `main` or change website credentials to implement this rule.
Rollback: revert the narrow allocation PR and redeploy the writer/observer;
never delete any model lots generated while the policy was active.
