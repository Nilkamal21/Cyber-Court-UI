# 🏛️ Cyber Court: Frontend Client Dashboard

This is the frontend dashboard for the **Cyber Court** application. It is a React dashboard built with **Vite**, **TypeScript**, **Tailwind CSS**, and **Lucide Icons**. 

It interfaces directly with the backend FastAPI WebSocket server to stream debate sequences, play spatial sounds, route SpeechSynthesis voice characteristics, and present judge evaluation indexes.

---

## 🚀 Key Features

* **Real-time Streaming**: Renders text word-by-word (Gemini-style) as tokens arrive.
* **Web Speech Persona Routing**: Routes native browser TTS voices to Prosecutor, Defender, and Judge personas based on gender registers, tempos, and pitches.
* **FIFO Event Queue**: Sequences incoming asynchronous websocket events so that speaker animations and text-to-speech playbacks never overlap.
* **Court Health Monitor**: Periodically health-checks the backend server. If the server is offline, it disables button interactions and flags the Marshall logs to show the judge is on leave.

---

## 📁 Folder Structure

```text
frontend/
├── src/
│   ├── App.tsx         # Dashboard UI, WebSocket handlers, and Voice synthesis
│   ├── main.tsx        # React entrypoint
│   └── index.css       # Custom styles (Cyberpunk glow themes & grid backgrounds)
├── .gitignore          # Frontend git ignore configuration
├── package.json        # Node script targets & NPM dependencies
├── tailwind.config.js  # Tailwind CSS theme setup
└── vite.config.ts      # Vite bundler configs
```

---

## 🛠️ Local Development & Running

1. **Install Node Packages**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   npm run dev
   ```

3. **Open the Application**:
   * Navigate to **`http://localhost:5173/`** in your browser.

---

## 📋 Available NPM Scripts

* `npm run dev`: Starts the Vite development server (hot reload active).
* `npm run build`: Compiles TypeScript types and builds the optimized production package to `dist/`.
* `npm run preview`: Previews the compiled production build locally.
* `npm run lint`: Scans code files for standard warnings.

---

## 🎙️ Web Speech Vocal Configuration

The browser handles SpeechSynthesis characteristics dynamically. Pitch registers are routed as follows:
* 📢 **Prosecutor**: Energy factor `1.05x`, Pitch `1.35` (energetic young female tone fallback).
* 🛡️ **Defender**: Energy factor `0.95x`, Pitch `1.02` (mature male tone fallback).
* 👩‍⚖️ **Judge**: Energy factor `0.76x`, Pitch `0.52` (deep, gravelly magistrate tone fallback).
