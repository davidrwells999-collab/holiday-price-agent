-- Row-level UPDATE/DELETE triggers (0001) do not fire on TRUNCATE, including
-- TRUNCATE ... CASCADE from quote or run. A statement-level trigger closes that gap.
CREATE TRIGGER price_observation_no_truncate BEFORE TRUNCATE ON price_observation
  FOR EACH STATEMENT EXECUTE FUNCTION price_observation_reject_mutation();
