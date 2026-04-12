## 1. Backend — Translation API Rewrite

- [x] 1.1 Use existing `linkedom` dependency for HTML parsing (already in api/package.json)
- [x] 1.2 Rewrite `api/src/routes/translate.ts` to parse HTML content into block-level segments using linkedom
- [x] 1.3 Implement per-segment translation: traverse DOM, collect text nodes, call Google Translate for each block
- [x] 1.4 Implement KV cache: check `translation:{userId}:{articleId}:{targetLang}` before translating, store result after translation with 7-day TTL
- [x] 1.5 Implement per-user rate limiting: sliding window counter in KV, 10 requests/60s, return 429 when exceeded
- [x] 1.6 Add target language validation: reject unsupported languages with 400 error
- [x] 1.7 Update API response format to return `{ segments: [{ original, translated }], targetLang, detectedLang }`
- [x] 1.8 Run `pnpm --filter api cf-typegen` to update Cloudflare bindings types (fixed output to .d.ts)

## 2. Frontend — Translation UI Enhancement

- [x] 2.1 Update `frontend/src/lib/types.ts`: add `TranslationSegment` type and update `TranslationResult` to include `segments` and `targetLang`
- [x] 2.2 Update `frontend/src/lib/store/articleStore.ts`: modify `translateArticle` to send HTML content and `targetLang`, store segment-based results, add `targetLanguage` state
- [x] 2.3 Add language selector dropdown to `frontend/src/components/app/article/ArticleToolbar.tsx` with zh-CN/zh-TW/en/ja/ko options
- [x] 2.4 Update `frontend/src/components/app/article/ArticleReader.tsx`: implement segment-level bilingual rendering (paired original + translation blocks)
- [x] 2.5 Add CSS styling for bilingual mode: distinct visual separation between original and translated segments
- [x] 2.6 Update translation button behavior: show loading state, auto-switch to bilingual mode on success, handle re-translation with new language

## 3. Mobile — Translation Feature (Flutter)

- [x] 3.1 Create `mobile/lib/providers/translation_provider.dart`: Riverpod provider for translation state (target language, translations map, loading state)
- [x] 3.2 Add translation API call in mobile Dio service: `POST /api/translate` with articleId, content, targetLang
- [x] 3.3 Implement mobile translation cache using SharedPreferences: key `translation:{articleId}:{targetLang}`, 7-day TTL
- [x] 3.4 Add language selector to mobile article detail screen (bottom sheet or settings menu)
- [x] 3.5 Add translation button to mobile article toolbar with loading state
- [x] 3.6 Implement three-mode view toggle in mobile article detail: 原文/双语/译文
- [x] 3.7 Implement segment-level bilingual rendering in mobile article widget

## 4. Testing & Verification

- [x] 4.1 Test backend translation API with various HTML content (headings, paragraphs, lists, inline tags) — 20 unit tests pass
- [x] 4.2 Test KV cache hit/miss behavior — tested via unit tests
- [x] 4.3 Test rate limiting: send 11 rapid requests and verify 429 on the 11th — tested via unit tests
- [ ] 4.4 Test frontend three-mode view toggle with translated articles (requires dev server + browser)
- [ ] 4.5 Test frontend language selector and re-translation with different languages (requires dev server + browser)
- [ ] 4.6 Test mobile translation end-to-end (requires Flutter build + iOS simulator)
- [ ] 4.7 Verify mobile cache behavior (cache hit, miss, expiration) (requires Flutter build + iOS simulator)
