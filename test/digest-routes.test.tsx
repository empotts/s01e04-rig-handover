import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/index.js';

let dir: string;
let app: ReturnType<typeof createApp>;

const jl = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(dir, '2030-01-01.jsonl'),
    jl(
      { at: '2030-01-01T01:00:00+01:00', job: 'zeta', status: 'ok', owner: 'ana' },
      { at: '2030-01-01T01:05:00+01:00', job: 'alpha', status: 'retry', owner: null, error: 'timeout' },
      { at: '2030-01-01T01:06:00+01:00', job: 'alpha', status: 'retry', owner: null, error: 'timeout' },
      { at: '2030-01-01T01:07:00+01:00', job: 'alpha', status: 'retry', owner: null, error: 'timeout' },
      { at: '2030-01-01T01:08:00+01:00', job: 'alpha', status: 'ok', owner: null },
      { at: '2030-01-01T02:00:00+01:00', job: 'mid', status: 'fail', owner: 'bo', error: 'boom' },
    ),
  );
  writeFileSync(join(dir, '2030-01-02.jsonl'), '');
  writeFileSync(
    join(dir, '2030-01-03.jsonl'),
    jl({ at: '2030-01-03T01:00:00+01:00', job: 'only', status: 'ok', owner: 'ana' }) +
      'this is not json\n{"at":1}\n',
  );
  app = createApp({ adapter: 'shim', installed: '2030-01-01T00:00:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { res, html: await res.text() };
};
const api = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};
// Job names in page order: first cell of each body row.
const pageJobs = (html: string) =>
  [...html.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night', () => {
  it('renders a normal night sorted by job, with warn marks and a dash for null owner', async () => {
    const { res, html } = await page('2030-01-01');
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['alpha', 'mid', 'zeta']);
    const rows = html.split('<tr').filter((r) => r.includes('<td>'));
    expect(rows[0]).toContain('class="warn"'); // alpha: 3 retries
    expect(rows[0]).toContain('<td>—</td>'); // null owner
    expect(rows[1]).toContain('class="warn"'); // mid: last status fail
    expect(rows[2]).not.toContain('class="warn"'); // zeta: ok
    expect(html).not.toContain('could not be read');
  });

  it('404s for a night with no file', async () => {
    const { res, html } = await page('2030-02-02');
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for this night');
  });

  it('says nothing ran for the empty night', async () => {
    const { res, html } = await page('2030-01-02');
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders with a note when a night has bad lines', async () => {
    const { res, html } = await page('2030-01-03');
    expect(res.status).toBe(200);
    expect(html).toContain('2 lines could not be read');
    expect(pageJobs(html)).toEqual(['only']);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns a normal night sorted by job, null owner kept as null', async () => {
    const { res, body } = await api('2030-01-01');
    expect(res.status).toBe(200);
    expect(body.night).toBe('2030-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);
    expect(body.rows[0]).toMatchObject({ owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: 'timeout' });
    expect(body.rows[1]).toMatchObject({ owner: 'bo', lastStatus: 'fail', lastError: 'boom' });
    expect(body.badLines).toBe(0);
  });

  it('404s for a night with no file', async () => {
    const { res, body } = await api('2030-02-02');
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'no run log for this night', night: '2030-02-02' });
  });

  it('returns rows: [] for the empty night', async () => {
    const { res, body } = await api('2030-01-02');
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts bad lines and still returns 200', async () => {
    const { res, body } = await api('2030-01-03');
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['only']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2030-01-01', '2030-01-02', '2030-01-03'])('same jobs in the same order for %s', async (n) => {
    const { html } = await page(n);
    const { body } = await api(n);
    expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
  });
});
