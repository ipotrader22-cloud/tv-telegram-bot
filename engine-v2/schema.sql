-- Engine V2 SHADOW storage schema. Not connected to production.
BEGIN;
CREATE SCHEMA IF NOT EXISTS vixale_v2;
CREATE TABLE IF NOT EXISTS vixale_v2.engine_runs (
 run_id uuid PRIMARY KEY, trading_date date NOT NULL, phase text NOT NULL
 CHECK (phase IN ('RESEARCH','DECISION','PUBLICATION','DELIVERY')),
 status text NOT NULL CHECK(status IN ('PENDING','RUNNING','PASS','FAIL','DEFERRED')),
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(trading_date,phase,run_id)
);
CREATE TABLE IF NOT EXISTS vixale_v2.model_lots (
 lot_id uuid PRIMARY KEY, ticker text NOT NULL, entry_date date NOT NULL,
 entry_at timestamptz NOT NULL, entry_price numeric(20,8) NOT NULL CHECK(entry_price>0),
 entry_score smallint NOT NULL CHECK(entry_score BETWEEN 0 AND 100),
 current_score smallint CHECK(current_score BETWEEN 0 AND 100),
 exit_at timestamptz, exit_price numeric(20,8) CHECK(exit_price>0),
 realized_return_pct numeric(22,16),
 exit_reason text CHECK(exit_reason IN ('TARGET','STOP LOSS','DROPPED FROM ACTIVE PORTFOLIO')),
 include_public text CHECK(include_public IN ('YES','NO')),
 public_effective_date date,
 CONSTRAINT consistent_exit CHECK (
  (exit_at IS NULL AND exit_price IS NULL AND realized_return_pct IS NULL AND exit_reason IS NULL AND include_public IS NULL AND public_effective_date IS NULL)
  OR
  (exit_at IS NOT NULL AND exit_price IS NOT NULL AND realized_return_pct IS NOT NULL AND exit_reason IS NOT NULL AND include_public IS NOT NULL AND public_effective_date IS NOT NULL AND exit_at>=entry_at)
 ),
 UNIQUE(ticker,entry_date)
);
CREATE TABLE IF NOT EXISTS vixale_v2.model_events (
 event_id text PRIMARY KEY, payload_hash char(64) NOT NULL,
 lot_id uuid NOT NULL REFERENCES vixale_v2.model_lots(lot_id),
 kind text NOT NULL CHECK(kind IN ('OPEN','CLOSE','RESEARCH')),
 payload jsonb NOT NULL, occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vixale_v2.quote_evidence (
 evidence_id uuid PRIMARY KEY, ticker text NOT NULL, source text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REGULAR_QUOTE','REGULAR_OPEN','REGULAR_BAR','DAILY_BAR')),
 observed_at timestamptz NOT NULL, collected_at timestamptz NOT NULL DEFAULT now(),
 price numeric(20,8) NOT NULL CHECK(price>0),
 details jsonb NOT NULL, verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS vixale_v2.research_reviews (
 trading_date date NOT NULL, ticker text NOT NULL, reviewed_at timestamptz NOT NULL,
 factor_points jsonb NOT NULL, score smallint NOT NULL CHECK(score BETWEEN 0 AND 100),
 evidence jsonb NOT NULL, complete boolean NOT NULL DEFAULT false,
 PRIMARY KEY(trading_date,ticker)
);
CREATE TABLE IF NOT EXISTS vixale_v2.equity_marks (
 trading_date date PRIMARY KEY, as_of timestamptz NOT NULL,
 realized numeric(20,8) NOT NULL, unrealized numeric(20,8) NOT NULL,
 active_count integer NOT NULL CHECK(active_count BETWEEN 0 AND 10),
 is_frozen boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS vixale_v2.delivery_outbox (
 idempotency_key text PRIMARY KEY, event_type text NOT NULL,
 trading_date date NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','SENDING','ACCEPTED','DELIVERED','FAILED')),
 provider_message_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
COMMIT;
