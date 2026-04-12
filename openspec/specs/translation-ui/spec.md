## ADDED Requirements

### Requirement: Translation language selector
The article toolbar SHALL provide a dropdown menu for selecting the target translation language from at least: 简体中文 (zh-CN), 繁體中文 (zh-TW), English (en), 日本語 (ja), 한국어 (ko). The default selection SHALL be 简体中文.

#### Scenario: User selects a different target language
- **WHEN** user opens the language dropdown and selects "日本語"
- **THEN** subsequent translation requests use `targetLang: "ja"`

#### Scenario: Selected language persists across articles
- **WHEN** user selects "日本語" for article A, then opens article B
- **THEN** the language selector still shows "日本語" for article B

### Requirement: Three-mode view toggle
The article reader SHALL provide three display modes when a translation exists: 原文 (original only), 双语 (bilingual side-by-side or interleaved), 译文 (translation only). The mode SHALL be switchable via buttons in the reader header.

#### Scenario: Switch to bilingual mode
- **WHEN** user clicks the "双语" button
- **THEN** each original paragraph is followed by its translated counterpart

#### Scenario: Switch to translation-only mode
- **WHEN** user clicks the "译文" button
- **THEN** only the translated text is displayed

#### Scenario: Switching back to original mode
- **WHEN** user clicks the "原文" button
- **THEN** only the original article content is displayed

### Requirement: Segment-level bilingual rendering
In bilingual mode, the reader SHALL render original and translated segments as paired blocks, with the original segment styled distinctly from the translated segment (e.g., different text color or a divider line).

#### Scenario: Bilingual mode renders paired segments
- **WHEN** an article has 5 translated segments and user switches to bilingual mode
- **THEN** the reader displays 10 blocks alternating: original1, translation1, original2, translation2, ...

#### Scenario: Translation segments preserve paragraph structure
- **WHEN** the original article has headings, paragraphs, and lists
- **THEN** the bilingual view renders each original block followed by its translation

### Requirement: Clear translation action
The article reader SHALL provide a "清除翻译" button that removes the cached translation for the current article from the frontend store and resets the view mode to original.

#### Scenario: Clear translation
- **WHEN** user clicks "清除翻译"
- **THEN** the translation is removed from the store, the view resets to original mode, and the language selector is hidden

### Requirement: Translation loading state
The toolbar translation button SHALL display a loading spinner while the translation request is in progress, and SHALL be disabled to prevent duplicate requests.

#### Scenario: Translation in progress
- **WHEN** user clicks the translate button
- **THEN** the button shows a spinner and is disabled until the request completes

#### Scenario: Translation completes successfully
- **WHEN** the translation API returns successfully
- **THEN** the button changes to show "译文" with a success style, and the view automatically switches to bilingual mode
