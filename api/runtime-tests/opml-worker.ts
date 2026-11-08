import { nativeSyncPage } from "../src/lib/native-sync";
import { getDb } from "../src/db";
// Test-only Worker. Never imported by the application entrypoint.
import { createImportPreview, confirmImport, dispatchImportItems, getImportJob, consumeImportMessage } from "../src/services/OpmlImportService";
import type { CloudflareEnv } from "../src/types";
import type { OpmlImportMessage } from "../src/services/OpmlImportService";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/native-sync") return Response.json(await nativeSyncPage(getDb(env.DB), "runtime", Number(url.searchParams.get("after") ?? 0)));
    if (url.pathname === "/start") {
      const count = Number(url.searchParams.get("count"));
      const prefix = crypto.randomUUID();
      const xml = `<opml><body>${Array.from({length:count},(_,i)=>`<outline text="Feed" xmlUrl="https://example.com/${prefix}/${i}"/>`).join("")}</body></opml>`;
      const id = await createImportPreview(env,"runtime",xml,"runtime.opml");
      await confirmImport(env,"runtime",id);
      let batches = 0;
      const queue = new Proxy(env.FEED_SYNC_QUEUE, {get(target,key) {
        if (key === "sendBatch") return async (messages: Iterable<MessageSendRequest>) => {
          if (++batches === 2 && url.searchParams.has("fail")) throw new Error("injected_second_batch_failure");
          return target.sendBatch(messages);
        };
        const value = Reflect.get(target,key);
        return typeof value === "function" ? value.bind(target) : value;
      }});
      let deferred = false;
      try { await dispatchImportItems({...env,FEED_SYNC_QUEUE:queue},id); } catch { deferred=true; }
      return Response.json({id,deferred});
    }
    if (url.pathname === "/dispatch") { await dispatchImportItems(env); return Response.json({ok:true}); }
    if (url.pathname === "/duplicate") {
      await env.FEED_SYNC_QUEUE.send({source:"opml-import",itemId:url.searchParams.get("item")!});
      return Response.json({ok:true});
    }
    return Response.json(await getImportJob(env,"runtime",url.searchParams.get("id")!));
  },
  async queue(batch,env) {
    for (const message of batch.messages) {
      await consumeImportMessage(env,message,{fetch:async url=>({
      title:"Runtime",description:"",siteUrl:"https://example.com",faviconUrl:null,
      articles:[{title:"Article",url:url+"/article",content:"<p>Test</p>",summary:"Test",author:"",imageUrl:null,publishedAt:null,guid:url}]
      })});
      await env.DB.prepare("INSERT INTO runtime_deliveries(item_id) VALUES (?)").bind(message.body.itemId).run();
    }
  }
} satisfies ExportedHandler<CloudflareEnv,OpmlImportMessage>;
