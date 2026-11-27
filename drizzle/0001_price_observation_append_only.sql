CREATE FUNCTION price_observation_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'price_observation is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER price_observation_no_update BEFORE UPDATE ON price_observation
  FOR EACH ROW EXECUTE FUNCTION price_observation_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER price_observation_no_delete BEFORE DELETE ON price_observation
  FOR EACH ROW EXECUTE FUNCTION price_observation_reject_mutation();
