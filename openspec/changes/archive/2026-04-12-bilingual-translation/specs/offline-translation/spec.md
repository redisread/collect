## ADDED Requirements

### Requirement: Mobile offline translation cache
The Flutter mobile app SHALL store translation results locally using SharedPreferences with key format `translation:{articleId}:{targetLang}` and a timestamp. The app SHALL check the local cache before making an API call and display cached results even when offline.

#### Scenario: Display cached translation when offline
- **WHEN** user opens an article with a locally cached translation while the device has no network
- **THEN** the app displays the cached translation from SharedPreferences

#### Scenario: Cache expiration after 7 days
- **WHEN** a cached translation is older than 7 days
- **THEN** the app removes the expired cache entry and treats it as a cache miss

#### Scenario: Cache hit avoids API call
- **WHEN** user opens an article with a valid cached translation while online
- **THEN** the app displays the cached translation without calling the translation API

### Requirement: Offline translation indicator
The mobile app SHALL display an "离线" badge or indicator when showing a cached translation while the device is offline, so users know they are viewing stale content.

#### Scenario: Offline indicator visible
- **WHEN** user views a translated article with no network connection
- **THEN** an "离线" badge appears near the translation controls

#### Scenario: No indicator when online with cache
- **WHEN** user views a translated article with a valid network connection
- **THEN** no offline indicator is shown (cache is transparent)

### Requirement: Mobile translation history sync
The mobile app SHALL sync translation history entries to the backend `translation_history` table when network is available, and display locally cached history entries when offline.

#### Scenario: Sync history on reconnect
- **WHEN** the app reconnects to the network after offline usage
- **THEN** pending translation history entries are uploaded to the backend

#### Scenario: Display mixed history online
- **WHEN** user views translation history while online
- **THEN** the app displays both backend history and local cache entries, deduplicated by articleId+targetLang
