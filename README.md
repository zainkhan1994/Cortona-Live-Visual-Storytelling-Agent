<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Cortona — Live Visual Storytelling Agent

A real-time interactive audio/visual AI agent powered by Google Gemini. Speak naturally and watch the visualizer respond with neon hologram images, 3D orbs, and dynamic animations.

## Features

- 🎙️ **Live Voice** — real-time bidirectional audio with Gemini's native audio model
- 🖼️ **Image Generation** — AI-generated neon wireframe hologram images for objects you mention
- 🌐 **3D Visualizer** — four visual modes (HTML image, abstract orb, emoji reactor, 3D sprite)
- 🔑 **No account needed** — just bring your own Gemini API key

## Using the Hosted App

1. Open the app in your browser
2. On the landing screen, paste your **Gemini API key** — it is saved only in your browser's localStorage and never sent anywhere except Google's API
3. Click **Launch Experience**
4. Click the **red circle** to start recording and talking to Cortona
5. Use the **layers icon** to cycle through visualizer modes
6. Use the **refresh icon** to reset the session
7. Click **🔑 Change Key** (top right) at any time to update your key

Get a free API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. *(Optional)* Set `GEMINI_API_KEY` in [.env.local](.env.local) to skip the key-entry screen locally
3. Run the app:
   `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000) — if no env key is set you will see the API key entry screen
