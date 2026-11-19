-- Least privilege for the app role: read the governed views and catalog, write only decisions and the audit log.
GRANT USAGE ON SCHEMA monetizeiq TO monetizeiq_app;
GRANT SELECT ON monetizeiq.app_config, monetizeiq.categories, monetizeiq.owners TO monetizeiq_app;
GRANT SELECT ON monetizeiq.v_account_book, monetizeiq.v_outcome_evidence TO monetizeiq_app;
GRANT SELECT, INSERT ON monetizeiq.decisions, monetizeiq.audit_log TO monetizeiq_app;
GRANT USAGE ON SEQUENCE monetizeiq.decisions_id_seq, monetizeiq.audit_log_id_seq TO monetizeiq_app;
