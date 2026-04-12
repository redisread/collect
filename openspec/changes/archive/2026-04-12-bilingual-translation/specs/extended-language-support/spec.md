## ADDED Requirements

### Requirement: Extended language support
The system SHALL support translation to at least the following 15 languages: zh-CN (简体中文), zh-TW (繁體中文), en (English), ja (日本語), ko (한국어), fr (Français), de (Deutsch), es (Español), pt (Português), ru (Русский), ar (العربية), hi (हिन्दी), it (Italiano), nl (Nederlands), th (ภาษาไทย). The default SHALL remain zh-CN.

#### Scenario: Translate to a newly supported language
- **WHEN** user requests translation with `targetLang: "fr"`
- **THEN** the article is translated to French and the translation is cached

#### Scenario: Unsupported language rejected
- **WHEN** user requests translation with `targetLang: "xx"` (unsupported)
- **THEN** the system returns 400 error "不支持的目标语言"

### Requirement: Language list configuration
The supported language list SHALL be defined as a shared constant accessible to both backend and frontend, ensuring consistency across the application.

#### Scenario: Frontend language selector matches backend support
- **WHEN** the frontend renders the language selector dropdown
- **THEN** it displays exactly the languages supported by the backend

#### Scenario: Add new language via configuration change
- **WHEN** a new language is added to the shared language configuration
- **THEN** both backend validation and frontend selector include the new language

### Requirement: Language preference persistence
The user's selected target language SHALL be persisted in the frontend store and restored on subsequent visits, defaulting to zh-CN for first-time users.

#### Scenario: Language preference restored after page reload
- **WHEN** user selects "日本語" and reloads the page
- **THEN** the language selector still shows "日本語"
