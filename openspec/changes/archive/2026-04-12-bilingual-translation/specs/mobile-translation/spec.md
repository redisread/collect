## ADDED Requirements

### Requirement: Mobile translation API integration
The Flutter mobile app SHALL call `POST /api/translate` with the article's content and target language, and display the translated segments in the article detail screen.

#### Scenario: User triggers translation on mobile
- **WHEN** user taps the translate button in the mobile article detail screen
- **THEN** the app calls the translation API and displays the result

#### Scenario: Translation failure on mobile
- **WHEN** the translation API returns an error
- **THEN** the app shows a toast message with the error and resets the button state

### Requirement: Mobile translation cache
The Flutter mobile app SHALL cache translation results locally using SharedPreferences (or Hive) with key format `translation:{articleId}:{targetLang}`, and check the cache before calling the API.

#### Scenario: Mobile cache hit
- **WHEN** user requests translation of a previously translated article with the same target language
- **THEN** the app displays the cached translation without calling the API

#### Scenario: Mobile cache expiration
- **WHEN** a cached translation is older than 7 days
- **THEN** the app treats it as a cache miss and calls the API

### Requirement: Mobile three-mode view toggle
The mobile article detail screen SHALL provide a segmented control or similar UI for switching between 原文, 双语, and 译文 modes when a translation exists.

#### Scenario: Toggle view modes on mobile
- **WHEN** user switches from 原文 to 双语 mode
- **THEN** the article content updates to show paired original and translated segments

### Requirement: Mobile language selector
The mobile app SHALL allow users to select the target translation language, defaulting to 简体中文. The selected language SHALL be persisted in SharedPreferences.

#### Scenario: User changes language on mobile
- **WHEN** user selects a new target language in the mobile settings or translation menu
- **THEN** the preference is saved and used for subsequent translation requests
