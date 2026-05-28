# Huff & Puff

A browser-based arcade game where you guide your fish through coral obstacles, collect pearls, and chase high scores on a global leaderboard. Choose from three characters: Puffy (pufferfish), Bubbles (teal fish), or Sunny (clownfish).

**Live:** [huff-and-puff.vercel.app](https://huff-and-puff.vercel.app)

---

## How to Play

- **Tap / click / spacebar** to flap and keep Puffy airborne
- Dodge the coral obstacles
- Collect items for bonus effects:

| Item | Effect |
|------|--------|
| Pearl | +1 point |
| Starfish | Points multiplied — collect consecutively for ×2, ×3… combos |
| Sea Urchin | Puffy puffs up, making him harder to dodge through gaps |
| Speed Boost | Swim faster for 4 seconds |

- Enter your name on the title screen to appear on the leaderboard
- Choose your character at the start of each session (or tap the fish icon on the title screen)
- Tap **?** on the title screen for a full item guide

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | [PixiJS](https://pixijs.com/) v7.3.2 |
| Backend / Leaderboard | Firebase Firestore (compat SDK v10.12.2) |
| Hosting | [Vercel](https://vercel.com) |
| Audio | HTML5 Audio API |

---

## Project Structure

```
huff-and-puff/
├── index.html        # Entry point
├── game.js           # All game logic and rendering
├── style.css         # Layout and canvas styling
├── build.sh          # Vercel build script — injects Firebase config
├── vercel.json       # Vercel configuration
├── audio/
│   ├── huffandpuff.mp3
│   └── coconut-compass.mp3
└── config.js         # Generated at build time (gitignored)
```

---

## Running Locally

1. Clone the repo
2. Create a `config.js` in the root with your Firebase project credentials:

```js
window.__FIREBASE_CONFIG__ = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

3. Serve the directory with any static server, e.g.:

```bash
npx serve .
```

---

## Deployment (Vercel)

The `build.sh` script generates `config.js` at build time from Vercel environment variables so Firebase credentials are never committed to the repository.

Set the following environment variables in your Vercel project settings:

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_MEASUREMENT_ID
```

`vercel.json` points Vercel to the build script automatically:

```json
{
  "buildCommand": "bash build.sh",
  "outputDirectory": "."
}
```
