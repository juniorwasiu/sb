-- ==============================================================================
-- Supabase Schema for Live Sports Dashboard (Upcoming Matches & Match Played)
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql
-- Safe to re-run multiple times (100% Idempotent).
-- ==============================================================================

-- 1. UPCOMING MATCHES TABLE
-- Stores newly discovered upcoming matches and their pre-match odds from the DOM.
CREATE TABLE IF NOT EXISTS public.upcoming_matches (
    id TEXT PRIMARY KEY,                       -- e.g. 2026-09-03_England_Virtual_ARS_CHE_1430
    game_id TEXT,                              -- Platform match/event ID or round ID
    league TEXT NOT NULL,                      -- League (e.g. England - Virtual, Spain - Virtual)
    match_date TEXT NOT NULL,                  -- YYYY-MM-DD
    match_time TEXT NOT NULL,                  -- HH:MM (e.g. 14:30)
    home_team TEXT NOT NULL,                   -- Home team name
    away_team TEXT NOT NULL,                   -- Away team name
    odds JSONB NOT NULL DEFAULT '{}'::jsonb,   -- DOM pre-match odds: { home_win, draw, away_win, over_1_5, over_2_5, gg, ng, ... }
    raw_odds_string TEXT,                      -- Raw text captured from DOM (e.g. "1(1.85) X(3.10) 2(4.20)")
    live_score TEXT DEFAULT '0:0',             -- Current in-play score (e.g. "0:0", "1:0")
    status TEXT NOT NULL DEFAULT 'UPCOMING',   -- 'UPCOMING' | 'IN_PLAY' | 'PLAYED' | 'EXPIRED'
    is_in_play BOOLEAN DEFAULT FALSE,          -- True if match has kicked off and is underway
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist even if the table was created earlier
ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS live_score TEXT DEFAULT '0:0';
ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS is_in_play BOOLEAN DEFAULT FALSE;

-- Indexes for upcoming_matches
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_league ON public.upcoming_matches (league);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_status ON public.upcoming_matches (status);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_date_time ON public.upcoming_matches (match_date, match_time);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_scraped_at ON public.upcoming_matches (scraped_at DESC);

-- Enable RLS for upcoming_matches
ALTER TABLE public.upcoming_matches ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies for upcoming_matches
DROP POLICY IF EXISTS "Allow public read upcoming_matches" ON public.upcoming_matches;
CREATE POLICY "Allow public read upcoming_matches"
    ON public.upcoming_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert upcoming_matches" ON public.upcoming_matches;
CREATE POLICY "Allow public insert upcoming_matches"
    ON public.upcoming_matches FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update upcoming_matches" ON public.upcoming_matches;
CREATE POLICY "Allow public update upcoming_matches"
    ON public.upcoming_matches FOR UPDATE USING (true);


-- 2. MATCH PLAYED TABLE
-- Stores full match details combining pre-match DOM odds with final verified results.
CREATE TABLE IF NOT EXISTS public.match_played (
    id TEXT PRIMARY KEY,                            -- Unified match ID
    game_id TEXT,                                   -- Match / Event code
    league TEXT NOT NULL,                           -- League name
    match_date TEXT NOT NULL,                       -- YYYY-MM-DD or DD/MM/YYYY
    match_time TEXT NOT NULL,                       -- Kickoff time
    home_team TEXT NOT NULL,                        -- Home team
    away_team TEXT NOT NULL,                        -- Away team
    score TEXT NOT NULL,                            -- Final score e.g. "2:1"
    ht_score TEXT DEFAULT '',                       -- Half-time score e.g. "1:0"
    home_score INTEGER NOT NULL,                    -- Home goals scored
    away_score INTEGER NOT NULL,                    -- Away goals scored
    winner TEXT NOT NULL,                           -- 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' (or '1' | 'X' | '2')
    winner_name TEXT NOT NULL,                      -- e.g. "Arsenal" or "Draw"
    odds JSONB NOT NULL DEFAULT '{}'::jsonb,        -- Exact pre-match odds from upcoming scraper DOM
    winning_outcomes JSONB NOT NULL DEFAULT '{}'::jsonb, -- Computed winning outcomes: { winner_1x2, winning_odd, total_goals, over_1_5, over_2_5, gg_ng }
    status TEXT NOT NULL DEFAULT 'FINISHED',        -- 'FINISHED' | 'VERIFIED'
    associated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for match_played
CREATE INDEX IF NOT EXISTS idx_match_played_league ON public.match_played (league);
CREATE INDEX IF NOT EXISTS idx_match_played_date ON public.match_played (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_played_created_at ON public.match_played (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_played_winner ON public.match_played (winner);

-- Enable RLS for match_played
ALTER TABLE public.match_played ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies for match_played
DROP POLICY IF EXISTS "Allow public read match_played" ON public.match_played;
CREATE POLICY "Allow public read match_played"
    ON public.match_played FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert match_played" ON public.match_played;
CREATE POLICY "Allow public insert match_played"
    ON public.match_played FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update match_played" ON public.match_played;
CREATE POLICY "Allow public update match_played"
    ON public.match_played FOR UPDATE USING (true);


-- 3. ENGINE PREDICTIONS TABLE
-- Stores multi-engine Head-to-Head (H2H) predictions and their automated evaluation outcomes.
CREATE TABLE IF NOT EXISTS public.engine_predictions (
    id TEXT PRIMARY KEY,                            -- e.g. engpred_2026-09-04_England_ARS_CHE_1430
    match_id TEXT,                                  -- Associated upcoming/played match ID
    game_id TEXT,                                   -- Platform match ID or code
    league TEXT NOT NULL,                           -- League (e.g. England - Virtual)
    match_date TEXT NOT NULL,                       -- YYYY-MM-DD
    match_time TEXT NOT NULL,                       -- HH:MM (e.g. 14:30)
    home_team TEXT NOT NULL,                        -- Home team
    away_team TEXT NOT NULL,                        -- Away team
    odds JSONB NOT NULL DEFAULT '{}'::jsonb,        -- Pre-match DOM odds
    h2h_sample_count INTEGER DEFAULT 0,             -- Number of historical clashes analyzed
    is_low_sample BOOLEAN DEFAULT FALSE,            -- True if sample count < 5
    consensus JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Neural consensus recommendation
    engines JSONB NOT NULL DEFAULT '[]'::jsonb,     -- All 6 individual engine breakdown outputs
    evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Auto-evaluation results: { status, primary_won, ... }
    status TEXT NOT NULL DEFAULT 'PENDING',         -- 'PENDING' | 'LIVE' | 'EVALUATED'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for engine_predictions
CREATE INDEX IF NOT EXISTS idx_engine_predictions_league ON public.engine_predictions (league);
CREATE INDEX IF NOT EXISTS idx_engine_predictions_status ON public.engine_predictions (status);
CREATE INDEX IF NOT EXISTS idx_engine_predictions_date_time ON public.engine_predictions (match_date, match_time);
CREATE INDEX IF NOT EXISTS idx_engine_predictions_created_at ON public.engine_predictions (created_at DESC);

-- Enable RLS for engine_predictions
ALTER TABLE public.engine_predictions ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies for engine_predictions
DROP POLICY IF EXISTS "Allow public read engine_predictions" ON public.engine_predictions;
CREATE POLICY "Allow public read engine_predictions"
    ON public.engine_predictions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert engine_predictions" ON public.engine_predictions;
CREATE POLICY "Allow public insert engine_predictions"
    ON public.engine_predictions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update engine_predictions" ON public.engine_predictions;
CREATE POLICY "Allow public update engine_predictions"
    ON public.engine_predictions FOR UPDATE USING (true);

