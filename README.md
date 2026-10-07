# linguil

https://github.com/user-attachments/assets/6586485f-584d-48b6-b45a-efbf3d47d69b

## 🔍 About

***[linguil](https://linguil.app)*** is the daily language guessing game. Guess the language family, language and meaning of a new word from the 100-word [Swadesh list](https://en.wikipedia.org/wiki/Swadesh_list) in a random language each day, add friends to your leaderboard, compete with your community on a Discord server, and add new languages to the game—all while learning about linguistics.

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

## 📖 Add a new language
<details>
<summary>Guide:</summary>
<br>

1. Check the [language wishlist](http://github.com/linguil/linguil/wiki/Language-Wishlist) for currently supported and unsupported languages (supported languages are ~~crossed out~~ as well as listed in [```public/data/MultiLangFamilies.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangFamilies.csv)).

2. Choose a language to add (languages need not be on the wishlist, but must be well-attested in academic literature; have some scholarly consensus around their top-level language family; and currently have speakers—no creoles, conlangs or dead languages).

3. Record its top-level language family at the bottom of [```public/data/MultiLangFamilies.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangFamilies.csv) in the correct style:

<div align=center>
  
  ```[Language],[Family]```.
  
</div>

4. Choose and record the most appropriate Text-to-Speech (TTS) language parameters at the bottom of [```public/data/LanguageCodes.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/LanguageCodes.csv) in the correct style, in order of priority—if your language is:
  
      (i) supported by Google's [Gemini TTS API](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation), use your language, langCode (BCP 47 language tag), and regionCode (ISO 3166-1 Alpha-2), and add your language to the ```LATIN_PREF_LANGS``` list (if it uses a Latin-based script as standard but [```public/data/MultiLangSwadesh.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangSwadesh.csv) includes an alternative non-Latin-based script);
      
      (ii) unsupported by Google's Gemini TTS API, but is supported by Google's [Gemini Live API](https://ai.google.dev/gemini-api/docs/live-api/capabilities#supported-languages), use your language, langCode (BCP 47 language tag), and regionCode (ISO 3166-1 Alpha-2), and add your language to the ```LATIN_PREF_LANGS``` list (if it uses a Latin-based script as standard but [```public/data/MultiLangSwadesh.csv```](https://github.com/linguil/linguil/blob/linguil/public/data/MultiLangSwadesh.csv) includes an alternative non-Latin-based script) and ```LIVE_API_DIRECT_LANGS``` list in [```functions/src/seed.ts```](https://github.com/linguil/linguil/blob/linguil/functions/src/seed.ts); or

      (iii) unsupported by both Google's Gemini TTS API and Gemini Live API, use the most similar language that shares the same standard script (or English if none are appropriate), its langCode (BCP 47 language tag) and regionCode (ISO 3166-1 Alpha-2), and your language as the accent (or the regional accent of your language if using English), and add your language to the ```LATIN_PREF_LANGS``` list (if the shared standard script is Latin-based) and ```UNSUPPORTED_BY_LIVE``` list in [```functions/src/seed.ts```](https://github.com/linguil/linguil/blob/linguil/functions/src/seed.ts)

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

8. Submit your changes to the [```linguil```](https://github.com/linguil/linguil) repo for approval (and earn linguil+ for free).
</details>

## 🌍 Community

### Discord
🕹️ **Game:** _[discord.com/activities/1473406949792940247](https://discord.com/activities/1473406949792940247)_ | 🌐 **Server:** _[discord.gg/p2GyWqVgea](https://discord.gg/p2GyWqVgea)_

🤖 **Bot commands:**
- _/setchannel [channel]_ — Set the channel where the bot will listen for and post linguil scores.
- _/leaderboard_ — View the daily and all-time linguil leaderboards for this server.

### Reddit
🕹️ **Game:** _coming soon_ | 🗫 **Subreddit:** _[r/linguil](https://reddit.com/r/linguil)_

🔓 **Fetch Domains:**
<details>
<summary>Requested Devvit domains:</summary>
<br>

- `us-central1-linguil.cloudfunctions.net` — Serves as a secure proxy for handling all backend game logic—required as the game's backend is built using Firebase, Firestore, and Google Cloud Storage (GCS), which are not directly accessible from the Devvit environment. The proxy:

    (i) authenticates requests from the Devvit app and forwards them to the Firestore/Firebase Auth REST APIs, allowing for secure authentication, score-saving, user accounts, friends, leaderboards, etc., and
      
    (ii) fetches audio files from GCS and forwards them to the Devvit app with caching headers, allowing for fast, reliable daily word pronunciation playback.
  
  This architecture is essential for the game's functionality, compliance with Devvit's WebView Content Security Policy (CSP) restrictions, and cross-platform interoperability with non-Reddit users (Redis cannot support the required cross-platform relational data structures). The following API routes are handled by this proxy:
  - Authentication
    - `/api/create-user-account`: Creates a new user account in Firebase Authentication and Firestore.
    - `/api/auth/exchange`: Exchanges a Firebase custom token for a session ID token, and sets a secure, httpOnly cookie to establish a user session.
    - `/api/auth/logout`: Logs the user out of an authenticated session.
    - `/api/auth/reddit`: Handles Reddit user authentication via Firebase/Firestore.
  - Game
    - `/api/audio/*`: Proxies and caches daily word TTS audio files from Google Cloud Storage to the client.
    - `/api/daily-word`: Fetches all daily game data (including words, languages, families, and statistics) from Firestore.
    - `/api/game/score`: Handles saving and retrieving user game scores using Firestore.
  - Payments
    - `/internal/payments/fulfill`: Adds linguil+ status to a user's account in Firestore after Reddit Gold payment.
    - `/internal/payments/refund`: Removes linguil+ status from a user's account in Firestore after Reddit Gold refund.
    - `/api/verify-payment`: Checks a user's payment status in Firestore for linguil+.
  - User
    - `/api/user/add-friend`: Adds a user to the current user's friends list on Firestore.
    - `/api/user/friends`: Fetches the current user's list of friends on Firestore.
    - `/api/user/image`: Proxies user Snoovatars from Firestore to the client.
    - `/api/leaderboard`: Fetches the current user's leaderboard data from Firestore.
    - `/api/user/me`: Retrieves the current user's profile information from Firestore.
    - `/api/user/remove-friend`: Removes a user from the current user's friends list on Firestore.
    - `/api/user/update-name`: Updates the current user's display name in Firestore.
- `storage.googleapis.com` — Required for Google TTS audio hosting.
</details>

___

💡 Created by ***Charlie McCombie ([@Papuang](https://github.com/Papuang/))***

🫶 Supported by community contributors:
  
- ***Xeon ([@xeontheprotogen](http://github.com/xeontheprotogen))*** — Added Hungarian
- ***Shaheed Headley ([@ObsidioSteel](https://github.com/ObsidioSteel))*** — Added Finnish, Estonian, Czech & Slovak
- ***fw ([@thefrankwan](https://github.com/thefrankwan))*** — Added Greek

___