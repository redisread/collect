import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ArticleReader } from "../components/app/article/ArticleReader";
import { useArticleStore } from "../lib/store/articleStore";
import { useFeedStore } from "../lib/store/feedStore";
import type { Article } from "../lib/types";

let container: HTMLDivElement;
let root: Root;
const articles = ['a','b','c'].map(id => ({id, title: id, content: '<p>Body text</p><pre>Code</pre><table><tbody><tr><td>Table</td></tr></tbody></table>'} as Article));
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(useArticleStore.getState(), 'loadAnnotations').mockResolvedValue();
  vi.spyOn(useArticleStore.getState(), 'restoreAiTranslation').mockResolvedValue();
  vi.spyOn(useArticleStore.getState(), 'saveReadingProgress').mockResolvedValue();
  vi.spyOn(useFeedStore.getState(), 'fetchFeeds').mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json({success:true,data:articles.find(item => url.endsWith('/'+item.id))})));
  await useArticleStore.getState().selectArticle(null);
  useArticleStore.setState({articles, hasMore:false, translations:{
    'a:zh-CN': {original:articles[0].content!, translated:'译文', targetLang:'zh-CN', bilingualHtml:'<p>Body text<span class="translation-text">译文</span></p>', translatedHtml:'<p>译文</p>'},
  }, displayedLanguages:{}, displayedKeys:{}});
  await useArticleStore.getState().selectArticle('a');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ArticleReader />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const scroller = () => container.querySelector('.overflow-y-auto') as HTMLDivElement;
async function swipe(target: Element, fromX: number, toX: number, deltaY = 0, cancel = false) {
  await act(async () => {
    target.dispatchEvent(new TouchEvent('touchstart', {bubbles:true,touches:[{clientX:fromX,clientY:100} as Touch]}));
    target.dispatchEvent(new TouchEvent('touchmove', {bubbles:true,cancelable:true,touches:[{clientX:toX,clientY:100+deltaY} as Touch]}));
    target.dispatchEvent(new TouchEvent(cancel ? 'touchcancel' : 'touchend', {bubbles:true,touches:[]}));
  });
}
it('switches both directions and restores the previous view and scroll position', async () => {
  await act(async () => (container.querySelector('#reader-tab-both') as HTMLButtonElement).click());
  await act(async () => { scroller().scrollTop = 450; scroller().dispatchEvent(new Event('scroll')); });
  await swipe(container.querySelector('h1')!, 300, 120);
  expect(useArticleStore.getState().selectedArticleId).toBe('b');
  expect(scroller().scrollTop).toBe(0);
  await swipe(container.querySelector('h1')!, 120, 300);
  expect(useArticleStore.getState().selectedArticleId).toBe('a');
  expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe('双语');
  expect(scroller().scrollTop).toBe(450);
});
it.each(['vertical','short','edge','code','table','cancel'])('leaves %s gestures in the current article', async kind => {
  const target = container.querySelector(kind === 'code' ? 'pre' : kind === 'table' ? 'td' : 'h1')!;
  await swipe(target, kind === 'edge' ? 5 : 300, kind === 'short' ? 270 : 120, kind === 'vertical' ? 250 : 0, kind === 'cancel');
  expect(useArticleStore.getState().selectedArticleId).toBe('a');
});
it('provides keyboard-accessible navigation buttons', async () => {
  const next = [...container.querySelectorAll('button')].find(button => button.textContent === '下一篇 →')!;
  await act(async () => next.click());
  expect(useArticleStore.getState().selectedArticleId).toBe('b');
});
