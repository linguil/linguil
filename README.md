# linguil

<p align="center">
  <img src="public/logo.png" alt="linguil logo" width="280" />
</p>

https://github.com/user-attachments/assets/6586485f-584d-48b6-b45a-efbf3d47d69b

## 🔍 About

***[linguil](https://linguil.app)*** is the daily language guessing game for linguistics enthusiasts, language learners, and word-game fans. Guess the language family, language, and meaning of a new word from the 100-word [Swadesh list](https://en.wikipedia.org/wiki/Swadesh_list) in 1 of 65 world languages each day, add friends to your leaderboard, compete with your community on a Discord server or Reddit subreddit, and add new languages to the game—all while learning about linguistics.

## ⚙️ Technical overview

- ***Next.js***-based web application (adapted to use ***Vite*** and ***Hono*** for Devvit)
- **Backend:**

  - ***Google Cloud***: *Functions* (compute), *Storage* (TTS audio storage), *Compute Engine* (Discord bot hosting)
  - ***Firebase***: *Firestore* (database), *Authentication* (user management), *App Hosting* (web app hosting), *Hosting* (OAuth hosting), *Performance Monitoring* (observability), *Analytics* (growth tracking)
  - ***Gemini API***: *TTS*/*Live API* (text-to-speech audio generation)
  - ***Discord SDK*** (*Discord Activity* & bot)
  - ***Devvit*** (*Games on Reddit* app)
  - ***Stripe*** (linguil+ payments)

- **Frontend:**

  - ***Tailwind CSS*** (styling)
  - ***Radix*** (UI)
  - ***Recharts*** (custom user leaderboards)

## 🌍 Add a new language

<details>
<summary>📋 <b>Guide</b> <i>[click to expand]</i></summary>
<br>

1. Check the [language wishlist](http://github.com/linguil/linguil/wiki/Language-Wishlist) for currently supported and unsupported languages (supported languages are ~~crossed out~~ as well as listed in [```public/data/MultiLangFamilies.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangFamilies.csv)).

2. Choose a language to add (languages need not be on the wishlist, but must be well-attested in academic literature; have some scholarly consensus around their top-level language family; and currently have speakers—no creoles, conlangs or dead languages).

3. Record its top-level language family at the bottom of [```public/data/MultiLangFamilies.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangFamilies.csv) in the correct style:

<div align=center>
  
  ```[Language],[Family]```.
  
</div>

4. Choose and record the most appropriate Text-to-Speech (TTS) language parameters (where langCode is the BCP 47 language tag and regionCode is the ISO 3166-1 Alpha-2 code) at the bottom of [```public/data/LanguageCodes.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/LanguageCodes.csv) in the correct style, in order of priority—if your language is:
  
      (i) supported by Google's [Gemini TTS API](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation), use your language, langCode, and regionCode, and add your language to the ```LATIN_PREF_LANGS``` list (if it uses a Latin-based script as standard but [```public/data/MultiLangSwadesh.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangSwadesh.csv) includes an alternative non-Latin-based script);
      
      (ii) unsupported by Google's Gemini TTS API, but is supported by Google's [Gemini Live API](https://ai.google.dev/gemini-api/docs/live-api/capabilities#supported-languages), use your language, langCode, and regionCode, and add your language to the ```LATIN_PREF_LANGS``` list (if it uses a Latin-based script as standard but [```public/data/MultiLangSwadesh.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangSwadesh.csv) includes an alternative non-Latin-based script) and ```LIVE_API_DIRECT_LANGS``` list in [```functions/src/seed.ts```](https://github.com/linguil/linguil/blob/linguil/functions/src/seed.ts); or

      (iii) unsupported by both Google's Gemini TTS API and Gemini Live API, use the most similar language that shares the same standard script (or English if none are appropriate), its langCode and regionCode, and your language as the accent (or the regional accent of your language if using English), and add your language to the ```LATIN_PREF_LANGS``` list (if the shared standard script is Latin-based) and ```UNSUPPORTED_BY_LIVE``` list in [```functions/src/seed.ts```](https://github.com/linguil/linguil/blob/linguil/functions/src/seed.ts)

<div align=center>
  
  ```[Language],[langCode],[regionCode],[accent (optional)]``` (note that the comma after ```[regionCode]``` must always be retained even if an accent is omitted).

</div>

5. Choosing from the region list—Americas; East Asia & Pacific; Europe; MENA & Central Asia; South Asia; and Sub-Saharan Africa—record in the correct style:

      (i) the language's region of origin at the bottom of [```public/data/MultiLangRegions.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangRegions.csv) (note that languages can only have 1 region); and
      
      (ii) (if adding a language from a new family) the region(s) of origin for its language family's languages at the bottom of [```public/data/LangFamilyRegions.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/LangFamilyRegions.csv) (note that additional language family regions should be on separate rows)

<div align=center>
  
  ```[Language (Family)],[Region]```.
  
</div>

6. Record at the bottom of [```public/data/LangStats.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/LangStats.csv) in the correct style:

      (i) the approx. total number of global speakers (L1 + L2);
      
      (ii) the country (and state/province(s) if the country is large) with the most speakers; and
      
      (iii) the approx. total number of speakers in that country (L1 + L2)

<div align=center>
  
  ```[Language],~[# GlobalSpeakers],[Country (State / Province),~[# CountrySpeakers]```.

</div>

7. Record each word in the 100-word Swadesh list at the end of each row of [```public/data/MultiLangSwadesh.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangSwadesh.csv) in the correct style, both:

      (i) in the original native script (if available, or a standard alternative script if the dominant script is Latin-based); and
      
      (ii) transliterated into the Latin script (allowing novel letters, punctuation, and diacritics, but not tone numbers)

<div align=center>
  
  ```,[Native/AlternativeScript] ([LatinScript])``` or ```,[LatinScript]``` (if no alternative scripts are available).

</div>

8. Submit your changes to the [```linguil```](https://github.com/linguil/linguil) repo for approval (and unlock linguil+ for free).
</details>

## 🎮 Discord _(Discord Activities)_

- 🕹️ **Play game:** _[discord.com/activities/1473406949792940247](https://discord.com/activities/1473406949792940247)_
- ➕ **Add to server:** _[discord.com/discovery/applications/1473406949792940247](https://discord.com/discovery/applications/1473406949792940247)_
- 🌐 **Join community/support server:** _[discord.gg/p2GyWqVgea](https://discord.gg/p2GyWqVgea)_

### 🤖 Bot commands
- `/setchannel [channel]` — Set the channel where the bot will listen for shared linguil scores and post leaderboards.
- `/leaderboard` — View the daily and all-time linguil leaderboards for this server.

### ⚖️ Bot reactions
- `🐻` — Shared linguil score passed verification and was included in leaderboards.
- `🐍` — Shared linguil score failed verification and was excluded from leaderboards.

  _Note:_ If the bot is `🐍`-reacting to your accurate shared scores, ensure you are signed into the same Discord account when playing linguil and sharing scores, OR link your Discord account to your Google/email account on the [Leaderboard](https://linguil.app/leaderboard) page.

## 👽 Reddit _(Games on Reddit)_

- 🕹️ **Play game:** _[reddit.com/r/linguil/s/F9u1xda66u](https://www.reddit.com/r/linguil/s/F9u1xda66u)_
- ➕ **Add to subreddit:** _[developers.reddit.com/apps/linguil](https://developers.reddit.com/apps/linguil)_
- 🗫 **Join community/support subreddit:** _[r/linguil](https://reddit.com/r/linguil)_

### 🛠️ Setup _(for moderators)_
1. _Install the app:_ Add `linguil` to your subreddit via the [Reddit Developer App Directory](https://developers.reddit.com/apps/linguil)—no configuration required.
2. _Automated daily posts:_ Once installed, `linguil` automatically submits a new interactive daily game post to your subreddit every day at 05:00 UTC via the Devvit Scheduler.
3. _Manual post creation:_ Subreddit moderators can manually create an interactive linguil game post on-demand by opening the subreddit action menu (via the `(…)` button in the top-right of the subreddit feed) and selecting `Create linguil post`.

### 🎮 Features _(for players)_
- _In-feed gameplay:_ Play linguil directly in your Reddit feed on browser or in-app on mobile (iOS/Android).
- _Daily words:_ Identify the language family, language, and meaning of a new word (with pronunciation audio) every day.
- _Cross-platform leaderboards:_ Track your scores and compete with other members of your subreddit (or any other players cross-platform) on your Leaderboard page.
- _linguil+ with Reddit Gold:_ Unlock linguil+ using Reddit Gold to unlock unlimited, offline games.

### 📜 Changelog

**`v0.9.0`** — _Pre-release for final testing_

### 🔓 Fetch Domains

<details>
<summary>Requested Devvit domains <i>[click to expand]</i></summary>
<br>

- `us-central1-linguil.cloudfunctions.net` — Serves as a secure backend proxy connecting the Devvit app to the Firebase Authentication and Firestore REST APIs, which are not directly accessible from the Devvit environment. This architecture allows for secure user management, game data storage/retrieval, and Reddit Gold payment handling, and is essential for the game's functionality, compliance with Devvit's WebView Content Security Policy (CSP) restrictions, and cross-platform interoperability with non-Reddit users (Redis cannot support the required cross-platform relational data structures). The following API routes are handled by this proxy:
  - `/redditAuth` Cloud Function
    - `/api/auth/reddit`: Handles account creation and authentication for users using their Reddit UID in Firebase Auth/Firestore, returning custom tokens.
  - `/authProxy` Cloud Function
    - `/api/auth/exchange`: Exchanges Firebase custom tokens for session ID tokens, verifies session tokens via the Firebase Auth REST API, and sets a secure, httpOnly cookie to establish a user session.
  - `/firestoreProxy` Cloud Function
    - `/api/daily-word`: Fetches all daily game data (words, languages, families, and statistics) from Firestore.
    - `/api/game/score`: Handles saving and retrieving user game scores using Firestore.
    - `/api/user/add-friend`: Adds a user to the current user's friends list on Firestore.
    - `/api/user/friends`: Fetches the current user and their friends' stats from Firestore for their leaderboard.
    - `/api/user/me`: Fetches the current user's profile information from Firestore.
    - `/api/user/remove-friend`: Removes a user from the current user's friends list on Firestore.
    - `/api/user/update-name`: Updates the current user's display name in Firestore.
    - `/api/verify-payment`: Checks a user's payment status in Firestore for linguil+.
    - `/internal/payments/fulfill`: Adds linguil+ status to a user's account in Firestore after Reddit Gold payment.
    - `/internal/payments/refund`: Removes linguil+ status from a user's account in Firestore after Reddit Gold refund.
- `storage.googleapis.com` — Required for daily word TTS audio hosting on Google Cloud Storage (GCS). On mobile, loading audio directly from GCS often fails or stutters because mobile browsers expect byte-range streaming. Caching the audio files prevents this, enabling reliable pronunciation playback, reducing bandwidth usage and latency, and avoiding potential GCS rate limiting, as users who replay the pronunciation load it instantly from local cache.
  - `/api/audio/*`: Fetches and caches daily word TTS audio files from GCS.
- Handled internally by Devvit Hono server
  - `/api/auth/logout`: Logs the user out of an authenticated session.
  - `/api/telemetry/*`: Handles Devvit Journeys telemetry events for gameplay analytics.
  - `/api/user/image`: Fetches user Snoovatars from Reddit CDNs.

</details>

## 🛡️ Privacy Policy / ToS

- **Web/Discord:** [linguil.app/privacy](https://linguil.app/privacy)
- **Reddit:** Select the `ⓘ` button on the game homepage inside Reddit.

___

💡 Created by ***Charlie McCombie ([@Papuang](https://github.com/Papuang/))***

🫶 Supported by community contributors:
  
- ***Xeon ([@xeontheprotogen](http://github.com/xeontheprotogen))*** — Added Hungarian
- ***Shaheed Headley ([@ObsidioSteel](https://github.com/ObsidioSteel))*** — Added Finnish, Estonian, Czech & Slovak
- ***fw ([@thefrankwan](https://github.com/thefrankwan))*** — Added Greek

___