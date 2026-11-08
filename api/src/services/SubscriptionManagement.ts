import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { articles, feeds, folders } from "../db/schema";
import { nativeArticleFields } from "../lib/native-sync";
import { HTTPException } from "hono/http-exception";

export const jsonValues = (ids: string[]) =>
  sql`(SELECT value FROM json_each(${JSON.stringify(ids)}))`;

export async function unsubscribeFeeds(db: DB, userId: string, ids: string[]) {
  const selected = and(
    eq(feeds.userId, userId),
    inArray(feeds.id, jsonValues(ids)),
  );
  const owned = await db.select({ id: feeds.id }).from(feeds).where(selected);
  if (owned.length !== ids.length)
    throw new HTTPException(404, { message: "订阅源不存在，请刷新后重试" });
  const allOwned = sql`(SELECT count(*) FROM feeds WHERE user_id=${userId} AND id IN ${jsonValues(ids)}) = ${ids.length}`;
  const [, , updated, retained] = await db.batch([
    db
      .update(feeds)
      .set({
        unsubscribedAt: sql`coalesce(${feeds.unsubscribedAt}, datetime('now'))`,
        isActive: false,
        folderId: null,
      })
      .where(and(selected, allOwned)),
    db
      .delete(articles)
      .where(
        and(
          eq(articles.userId, userId),
          inArray(articles.feedId, jsonValues(ids)),
          sql`coalesce(${articles.isStarred},0)=0 AND coalesce(${articles.isReadLater},0)=0`,
          allOwned,
        ),
      ),
    db.select().from(feeds).where(selected),
    db
      .select(nativeArticleFields)
      .from(articles)
      .where(
        and(
          eq(articles.userId, userId),
          inArray(articles.feedId, jsonValues(ids)),
        ),
      ),
  ]);
  if (updated.length !== ids.length)
    throw new HTTPException(409, { message: "订阅已变化，请刷新后重试" });
  return { feeds: updated, articles: retained };
}

export async function moveSubscriptions(
  db: DB,
  userId: string,
  ids: string[],
  folderId: string | null,
) {
  const targetExists =
    folderId === null
      ? sql`1`
      : sql`EXISTS (SELECT 1 FROM folders WHERE id=${folderId} AND user_id=${userId})`;
  const allOwned = sql`(SELECT count(*) FROM feeds WHERE user_id=${userId} AND unsubscribed_at IS NULL AND id IN ${jsonValues(ids)}) = ${ids.length}`;
  const updated = await db
    .update(feeds)
    .set({ folderId })
    .where(
      and(
        eq(feeds.userId, userId),
        isNull(feeds.unsubscribedAt),
        inArray(feeds.id, jsonValues(ids)),
        targetExists,
        allOwned,
      ),
    )
    .returning();
  if (updated.length !== ids.length)
    throw new HTTPException(409, {
      message: "订阅或文件夹已变化，请刷新后重试",
    });
  return updated;
}

export async function reorderFolders(db: DB, userId: string, ids: string[]) {
  const allOwned = sql`(SELECT count(*) FROM folders WHERE user_id=${userId} AND id IN ${jsonValues(ids)}) = ${ids.length}`;
  const updated = await db
    .update(folders)
    .set({
      sortOrder: sql`(SELECT CAST(key AS INTEGER) FROM json_each(${JSON.stringify(ids)}) WHERE value=${folders.id})`,
    })
    .where(
      and(
        eq(folders.userId, userId),
        inArray(folders.id, jsonValues(ids)),
        allOwned,
      ),
    )
    .returning();
  if (updated.length !== ids.length)
    throw new HTTPException(409, { message: "文件夹已变化，请刷新后重试" });
  return updated;
}
