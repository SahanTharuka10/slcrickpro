-- SQL migration reference (for relational deployments)
-- Your current app uses MongoDB, so this is provided as requested for SQL environments.

ALTER TABLE tournaments
ADD COLUMN scoring_password VARCHAR(255) NULL;

-- Optional index for lookup-heavy environments
CREATE INDEX idx_tournaments_scoring_password ON tournaments (scoring_password);
