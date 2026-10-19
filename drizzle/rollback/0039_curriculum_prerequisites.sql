-- Revert application code first. Curriculum-specific rules cannot safely become global rules.
-- Refuse rollback while rules exist; export/reconcile them before attempting rollback.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0039_rollback_guard (violations integer CHECK(violations=0));
INSERT INTO __0039_rollback_guard SELECT count(*) FROM curriculum_prerequisite;
INSERT INTO __0039_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792448361820;
DROP TABLE __0039_rollback_guard;
CREATE TABLE subject_prerequisite (
    subject_id text NOT NULL REFERENCES subject(id) ON DELETE cascade,
    prerequisite_id text NOT NULL REFERENCES subject(id) ON DELETE restrict,
    PRIMARY KEY(subject_id, prerequisite_id),
    CONSTRAINT subject_prerequisite_not_self CHECK(subject_id <> prerequisite_id)
);
CREATE INDEX subject_prerequisite_required_idx ON subject_prerequisite(prerequisite_id);
DROP TABLE curriculum_prerequisite;
DELETE FROM __drizzle_migrations WHERE created_at=1792448361820;
COMMIT;
