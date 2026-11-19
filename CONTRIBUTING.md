# Contributing

Thanks for taking a look. This is a portfolio project, and issues and small pull requests are welcome.

1. Fork and clone, then `cd app && npm ci`.
2. Change data in `data/catalog.json`, never in the generated files, then run `python3 data/generate_data.py` from the repo root.
3. Keep every number engine-computed: pricing logic lives in `app/public/engine.js`, business rules in `app/src/service.js`.
4. Run `npm test` before opening a pull request, and add a test for new behavior.
5. If you change the UI, re-record the walkthrough with `make video` (see `app/scripts/video/`).
6. Keep all data fictional and all emails on the `.example` domain.

By contributing you agree your work is licensed under the Apache License 2.0.
