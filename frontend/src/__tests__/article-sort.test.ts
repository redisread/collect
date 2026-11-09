import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArticleStore } from "../lib/store/articleStore";
import { useFeedStore } from "../lib/store/feedStore";
vi.mock("../lib/store/aiSettingsStore", () => ({ useAiSettingsStore: { getState: () => ({ profiles: [], activeProfileId: null }) } }));
const response = (data: unknown, success = true) => new Response(JSON.stringify({success,data}), {status:success ? 200 : 500});
beforeEach(() => {
  useArticleStore.setState({sortOrder:'desc',page:3,articles:[],isSavingSort:false,articleActionError:null});
  useFeedStore.setState({selectedSource:{type:'all'},markingFolderId:null});
});
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks();});
it('resets the whole pagination after saved order and rejects an earlier settings response',async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}))
    .mockResolvedValueOnce(response({articleSortOrder:'asc'}))
    .mockResolvedValueOnce(response({articles:[],total:0}));
  vi.stubGlobal('fetch',fetchMock);
  const loading = useArticleStore.getState().loadSortOrder();
  await useArticleStore.getState().saveSortOrder('asc');
  finish(response({articleSortOrder:'desc'}));
  await loading;
  expect(useArticleStore.getState().sortOrder).toBe('asc');
  expect(useArticleStore.getState().page).toBe(1);
  expect(String(fetchMock.mock.calls[2][0])).toContain('sort=asc');
  expect(String(fetchMock.mock.calls[2][0])).toContain('page=1');
});
it('keeps the saved sort after failed save and releases the busy state',async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({},false)));
  await useArticleStore.getState().saveSortOrder('asc');
  expect(useArticleStore.getState().sortOrder).toBe('desc');
  expect(useArticleStore.getState().isSavingSort).toBe(false);
  expect(useArticleStore.getState().articleActionError).toContain('重试');
});
it('deduplicates folder requests and exposes retry after failure',async () => {
  let finish!: (value: Response) => void;
  const fetchMock=vi.fn().mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  vi.stubGlobal('fetch',fetchMock);
  const first=useFeedStore.getState().markFolderRead('f');
  await useFeedStore.getState().markFolderRead('f');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  finish(response({},false));
  await first;
  expect(useFeedStore.getState().markingFolderId).toBeNull();
  expect(useArticleStore.getState().articleActionError).toContain('重试');
});
it('reports list failures instead of silently presenting an empty library and clears on retry', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response({},false)).mockResolvedValueOnce(response({articles:[],total:0})));
  expect(await useArticleStore.getState().fetchArticles({type:'all'})).toBe(false);
  expect(useArticleStore.getState().listError).toContain('重试');
  expect(await useArticleStore.getState().fetchArticles({type:'all'})).toBe(true);
  expect(useArticleStore.getState().listError).toBeNull();
});
