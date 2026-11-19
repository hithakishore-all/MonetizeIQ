'use strict';
/** Express web console and HTTP API. */
const path = require('path');
const express = require('express');
const { HttpError } = require('./service');
const pkg = require('../package.json');

function createApp(service, opts) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const store = service.store;

  app.get('/api/health', wrap(async (req, res) => {
    await store.ping();
    res.json({ ok: true, name: 'MonetizeIQ', version: pkg.version, mode: store.mode, slack: !!(opts && opts.slackEnabled), demoToday: (await store.config()).demoToday });
  }));
  app.get('/api/catalog', wrap(async (req, res) => res.json(await store.catalog())));
  app.get('/api/owners', wrap(async (req, res) => res.json(await store.owners())));
  app.get('/api/accounts', wrap(async (req, res) => {
    if (req.query.category) await service.category(String(req.query.category));
    res.json(await store.accounts(req.query.category ? String(req.query.category) : undefined));
  }));
  app.get('/api/accounts/:id', wrap(async (req, res) => res.json(await service.accountDetail(req.params.id))));
  app.get('/api/accounts/:id/events', wrap(async (req, res) => {
    await service.accountDetail(req.params.id);
    res.json(await store.events(req.params.id));
  }));
  app.get('/api/accounts/:id/recommendation', wrap(async (req, res) => {
    const d = await service.recommendation(req.params.id, 'web');
    res.json(d.recommendation);
  }));
  app.get('/api/book/:category', wrap(async (req, res) => res.json(await service.book(req.params.category, req.query))));
  app.get('/api/readiness', wrap(async (req, res) => res.json(await service.readinessRanking())));
  app.post('/api/decisions', wrap(async (req, res) => {
    const out = await service.approve(req.body, 'web:' + ((req.body && req.body.approverId) || 'unknown'));
    res.status(out.created ? 201 : 200).json(out);
  }));
  app.get('/api/decisions', wrap(async (req, res) => res.json(await store.decisions(Math.min(200, Number(req.query.limit) || 50)))));
  app.get('/api/audit', wrap(async (req, res) => res.json(await store.audit(Math.min(500, Number(req.query.limit) || 100)))));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: `No API route ${req.method} ${req.originalUrl}.` }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Request body is not valid JSON.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Request body is too large.' });
    console.error('[monetizeiq] unexpected error:', err && err.message);
    res.status(500).json({ error: 'internal', message: 'Something went wrong. Check the server log.' });
  });
  return app;
}

module.exports = { createApp };
