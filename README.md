# 🎵 Prompt DJ - Music Reconciliation Game

An interactive music puzzle game where players must match AI-generated album art to their corresponding musical genres by listening to real-time AI-generated audio tracks.

<div align="center">
  <img src="https://image.pollinations.ai/prompt/A%20cyberpunk%20music%20interface%20with%20neon%20glowing%20controls%20and%20holographic%20vinyl%20records" alt="Prompt DJ Banner" width="100%" />
</div>

## 🎮 How to Play

1.  **Listen**: Click the play button on any of the 5 slots to hear an AI-generated music track representing a specific genre.
2.  **Identify**: Look at the "deck" of 5 AI-generated album covers on the right.
3.  **Match**: Drag and drop the album cover that you think best visualizes the music into the playing slot.
4.  **Solve**: Continue until all 5 slots have an assigned image.
5.  **Reveal**: Click "Reveal Matches" to check your score.
    *   If you get 5/5 correct, the game celebrates and automatically restarts with new genres and images!
    *   If not, keep listening and swapping images until you get it right.

## ✨ Features

*   **Real-time AI Music Generation**: Powered by Google's MusicFX (via AI Studio) to generate infinite unique tracks for genres like "Minimal Techno", "Bossa Nova", "Dubstep", and more.
*   **AI Image Generation**: Album art is generated on the fly using Pollinations.ai based on the genre descriptions.
*   **Cyberpunk UI**: A fully responsive, immersive dark/neon interface built with Lit and CSS Grid.
*   **Drag & Drop Gameplay**: Intuitive drag-and-drop mechanics with support for swapping images between slots.
*   **Endless Replayability**: The game generates new unique prompts and images for every round.

## 🛠️ Tech Stack

*   **Frontend Framework**: [Lit](https://lit.dev/) (Web Components)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Language**: TypeScript
*   **AI Audio**: Google Gemini / MusicFX API
*   **AI Images**: Pollinations.ai

## 🚀 Run Locally

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd music-game-reconcilaete
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```

4.  **Open in Browser**
    Navigate to `http://localhost:3000` (or the port shown in your terminal).

## 📝 License

MIT
