import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
// Use the exact workerd/esbuild versions shipped with this project's pinned Wrangler.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const directory = await mkdtemp(join(tmpdir(),'collect-opml-runtime-'));
let mf;
try {
  const scriptPath = join(directory,'worker.mjs');
  await build({entryPoints:[new URL('../runtime-tests/opml-worker.ts',import.meta.url).pathname],outfile:scriptPath,
    banner:{js:'import { createRequire } from "node:module"; const require = createRequire("/worker.mjs");'},
    bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*']});
  const config = JSON.parse(await readFile(new URL('../../frontend/wrangler.jsonc',import.meta.url),'utf8'));
  mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(scriptPath,'utf8'),compatibilityDate:config.compatibility_date,
    compatibilityFlags:config.compatibility_flags,log:new Log(LogLevel.ERROR),
    d1Databases:['DB'],queueProducers:{FEED_SYNC_QUEUE:'opml-test'},
    queueConsumers:{'opml-test':{maxBatchSize:1,maxBatchTimeout:0,maxRetries:3}}}));
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../drizzle/migrations/',import.meta.url);
  for (const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(file,migrations),'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  }
  await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('runtime','Runtime','runtime@test.invalid',0,0)").run();
  await db.prepare("CREATE TABLE runtime_deliveries(item_id TEXT NOT NULL)").run();
  async function request(path) {
    const response = await mf.dispatchFetch('http://runtime.test'+path);
    assert.equal(response.status,200); return response.json();
  }
  async function completed(id,count) {
    const deadline=Date.now()+45_000;
    while(Date.now()<deadline) {
      const job=await request('/job?id='+id);
      if(job.status==='completed') {assert.equal(job.imported,count);assert.equal(job.failed,0);return job;}
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('runtime import did not complete');
  }
  for(const count of [100,147]) {
    const {id,deferred}=await request('/start?count='+count);assert.equal(deferred,false);
    const job=await completed(id,count);
    await request('/duplicate?item='+job.items[0].id);
    const deadline = Date.now() + 10_000;
    let deliveries = 0;
    do {
      deliveries = (await db.prepare("SELECT COUNT(*) AS n FROM runtime_deliveries WHERE item_id=?").bind(job.items[0].id).first()).n;
      if (deliveries >= 2) break;
      await new Promise(r=>setTimeout(r,100));
    } while (Date.now() < deadline);
    assert.ok(deliveries >= 2, "duplicate message must finish consumption before checking totals");
    assert.equal((await request('/job?id='+id)).imported,count);
    console.log(`PASS workerd D1/Queues import ${count}`);
  }
  const {id,deferred}=await request('/start?count=201&fail=1');assert.equal(deferred,true);
  // Advance only the outbox due timestamp; successful/processing rows keep their lease guard.
  await db.prepare('UPDATE opml_import_items SET next_dispatch_at=0 WHERE job_id=?').bind(id).run();
  await request('/dispatch');
  await completed(id,201);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM feeds').first()).n,448);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM articles').first()).n,448);
  console.log('PASS workerd partial send recovery and duplicate-safe persisted totals');
} finally {
  await mf?.dispose();
  await rm(directory,{recursive:true,force:true});
}
