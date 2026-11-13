// Local event editor: `npm run events:edit`, then open http://localhost:5174.
// Edits the "events" list of src/data/storyEvents.json. "Save and open PR" works in a
// temporary git worktree from origin/main, so your own checkout is never touched.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const REL = 'src/data/storyEvents.json';
const PORT = Number(process.env.PORT) || 5174;
const PLACES = ['anywhere', 'swamp', 'den', 'home', 'deadEnd', 'corridor', 'crossing', 'open'];
const TRIGGERS = ['step', 'hear'];
const EFFECTS = ['takeCake', 'giveFlowers', 'giveTreasure', 'takeFlowers', 'giveEnergy'];
// Effects that can find nothing to change (no cake, no flowers, energy full) and so need quiet versions.
const QUIET_EFFECTS = ['takeCake', 'takeFlowers', 'giveEnergy'];

// The file keeps its hand-made layout: one event is a few compact lines.
const q = JSON.stringify;
const list = (a) => `[${a.map(q).join(', ')}]`;
export function eventText(k) {
  const head = [`"id": ${k.id}`, `"name": ${q(k.name)}`, `"fits": ${q(k.fits)}`, `"trigger": ${q(k.trigger)}`];
  if (k.chance !== undefined) head.push(`"chance": ${k.chance}`);
  if (k.effect) head.push(`"effect": ${q(k.effect)}`);
  if (k.deed) head.push(`"deed": ${q(k.deed)}`);
  const lines = [head.join(', ') + ','];
  lines.push(`"versions": ${list(k.versions)},`);
  if (k.quiet?.length) lines.push(`"quiet": ${list(k.quiet)},`);
  lines.push(`"thoughts": ${list(k.thoughts)},`, `"popup": ${q(k.popup)}`);
  return `    {\n${lines.map((l) => `      ${l}`).join('\n')}\n    }`;
}
const START = '  "events": [\n';
const END = '\n  ],\n  "fantasy"';
export const readEvents = (text) => JSON.parse(text).events;
export function withEvents(text, events) {
  const a = text.indexOf(START) + START.length, b = text.indexOf(END);
  if (a < START.length || b < 0) throw new Error('Unexpected layout in ' + REL);
  return text.slice(0, a) + events.map(eventText).join(',\n') + text.slice(b);
}

function check(events) {
  const errs = [], ids = new Set();
  const str = (s) => typeof s === 'string' && s.trim();
  for (const k of events) {
    const w = `event ${k.id} (${k.name})`;
    if (!Number.isInteger(k.id) || k.id < 1 || ids.has(k.id)) errs.push(`${w}: id must be a unique whole number from 1`);
    ids.add(k.id);
    if (!str(k.name)) errs.push(`${w}: name is empty`);
    if (!PLACES.includes(k.fits)) errs.push(`${w}: unknown place`);
    if (!TRIGGERS.includes(k.trigger)) errs.push(`${w}: unknown trigger`);
    if (k.chance !== undefined && !(k.chance > 0 && k.chance <= 1)) errs.push(`${w}: chance must be above 0 and at most 1`);
    if (k.effect && (!EFFECTS.includes(k.effect) || k.trigger !== 'step')) errs.push(`${w}: bad effect (needs the step trigger)`);
    if (!Array.isArray(k.versions) || k.versions.length < 2 || !k.versions.every(str)) errs.push(`${w}: needs at least 2 non-empty versions`);
    if (!Array.isArray(k.thoughts) || k.thoughts.length < 1 || !k.thoughts.every(str)) errs.push(`${w}: needs at least 1 thought`);
    if (!str(k.popup) || k.popup.length > 16) errs.push(`${w}: pop-up must be 1 to 16 characters`);
    if (QUIET_EFFECTS.includes(k.effect) && !k.quiet?.length) errs.push(`${w}: ${k.effect} needs a quiet version`);
    if (k.quiet?.length && !QUIET_EFFECTS.includes(k.effect)) errs.push(`${w}: quiet only for ${QUIET_EFFECTS.join(', ')}`);
    if (k.effect && !str(k.deed)) errs.push(`${w}: an effect needs a report phrase (deed)`);
    if (k.deed && !k.effect) errs.push(`${w}: a report phrase (deed) only goes with an effect`);
  }
  return errs;
}

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function savePr(events, title, body) {
  const errs = check(events);
  if (errs.length) throw new Error(errs.join('\n'));
  const current = readFileSync(join(root, REL), 'utf8');
  const next = withEvents(current, events);
  if (next === current) throw new Error('Nothing changed.');
  run('git', ['fetch', 'origin', 'main']);
  const branch = `events-edit-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  const dir = mkdtempSync(join(tmpdir(), 'karkulka-events-'));
  try {
    run('git', ['worktree', 'add', '-b', branch, dir, 'origin/main']);
    writeFileSync(join(dir, REL), next);
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    try { run('npx', ['vitest', 'run', 'tests/storyEvents.test.ts'], dir); }
    catch (e) { throw new Error('The story tests fail with these changes:\n' + (e.stdout || e.message).slice(-1500)); }
    run('git', ['add', REL], dir);
    run('git', ['commit', '-m', title], dir);
    run('git', ['push', '-u', 'origin', branch], dir);
    const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body || 'Edited with the event editor (`npm run events:edit`).'], dir);
    return { url, branch };
  } finally {
    try { run('git', ['worktree', 'remove', '--force', dir]); } catch { rmSync(dir, { recursive: true, force: true }); }
  }
}

const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
const json = (res, code, o) => send(res, code, 'application/json', JSON.stringify(o));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer((req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(here, 'index.html'), 'utf8'));
      if (req.method === 'GET' && req.url === '/api/events') return json(res, 200, { events: readEvents(readFileSync(join(root, REL), 'utf8')), places: PLACES, triggers: TRIGGERS, effects: EFFECTS });
      if (req.method === 'POST' && req.url === '/api/save') {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => {
          try { const b = JSON.parse(data); json(res, 200, savePr(b.events, b.title || 'Edit forest events', b.body)); }
          catch (e) { json(res, 400, { error: String(e.message || e) }); }
        });
        return;
      }
      send(res, 404, 'text/plain', 'Not found');
    } catch (e) { json(res, 500, { error: String(e.message || e) }); }
  }).listen(PORT, '127.0.0.1', () => console.log(`Event editor: http://localhost:${PORT}  (needs git and the gh CLI, logged in)`));
}
