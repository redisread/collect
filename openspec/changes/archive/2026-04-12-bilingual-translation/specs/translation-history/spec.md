## ADDED Requirements

### Requirement: Translation history storage
The system SHALL store translation history records in a D1 table `translation_history` with fields: `id`, `userId`, `articleId`, `targetLang`, `sourceLang`, `translatedAt`, `articleTitle`, `feedName`. Each record SHALL be created automatically when a user successfully translates an article.

#### Scenario: History record created on successful translation
- **WHEN** user successfully translates article A to zh-CN
- **THEN** a new row is inserted into `translation_history` with the user's ID, article ID, language, and timestamp

#### Scenario: Duplicate history entries are allowed
- **WHEN** user translates the same article to the same language multiple times
- **THEN** each translation creates a new history record (to track translation activity timeline)

### Requirement: Translation history API endpoint
The system SHALL expose `GET /api/translations/history` endpoint that returns the user's translation history, sorted by `translatedAt` descending, with pagination support (`page` and `pageSize` query parameters, default page=1, pageSize=20).

#### Scenario: Fetch translation history
- **WHEN** user GETs `/api/translations/history`
- **THEN** the response returns `{ success: true, data: { items: [...], total: N, page: 1, pageSize: 20 } }`

#### Scenario: Paginated history fetch
- **WHEN** user GETs `/api/translations/history?page=2&pageSize=10`
- **THEN** the response returns items 11-20 of the user's translation history

#### Scenario: Empty history
- **WHEN** user has no translation history
- **THEN** the response returns `{ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } }`

### Requirement: Delete translation history entry
The system SHALL expose `DELETE /api/translations/history/:id` endpoint that allows users to delete individual history entries.

#### Scenario: Delete a history entry
- **WHEN** user DELETEs `/api/translations/history/{id}` with their own history entry ID
- **THEN** the entry is removed from the database and response returns `{ success: true }`

#### Scenario: Delete another user's history entry
- **WHEN** user attempts to delete a history entry belonging to another user
- **THEN** the system returns 403 forbidden

### Requirement: Translation history frontend page
The frontend SHALL provide a "翻译历史" page accessible from the sidebar or user menu, displaying a list of translated articles with article title, source feed name, target language, and translation date. Each entry SHALL be clickable to navigate to the article with the translation applied.

#### Scenario: View translation history page
- **WHEN** user navigates to the translation history page
- **THEN** the page displays a list of their translation records sorted by most recent

#### Scenario: Navigate to article from history
- **WHEN** user clicks a history entry
- **THEN** the app navigates to the article detail page with the corresponding translation automatically loaded

#### Scenario: Delete history entry from frontend
- **WHEN** user clicks the delete button on a history entry
- **THEN** the entry is removed from the list after confirmation
