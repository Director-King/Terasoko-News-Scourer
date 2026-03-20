import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import Jimp from "jimp";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// State
let lastGeneratedImage: Buffer | null = null;

const THEMES: Record<number, { name: string; focus: string }> = {
  1: { name: "Market Monday", focus: "Weekly outlook: Forex volatility, Kenya’s digital economy, and tech stocks." },
  2: { name: "Local Innovation", focus: "Kenyan tech news: The new AI Bill, startup funding, and local infrastructure." },
  3: { name: "AI Breakthroughs", focus: "Trending AI News: New model releases (e.g., MiniMax M2.5) and hardware updates." },
  4: { name: "Creative Tech", focus: "Filmmaking trends, AI-generated visuals, and design tools." },
  5: { name: "AI & Security", focus: "Trending AI News: Ethics, data leaks (e.g., Meta’s recent agent leak), and safety." },
  6: { name: "Weekly Recap", focus: "The 'Top 5' stories you missed this week." },
  0: { name: "Future Scenarios", focus: "Predictions for the next 5 years and community Q&A/Polls." },
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Validate environment variables
  const requiredEnv = [
    "GEMINI_API_KEY",
    "APP_URL"
  ];
  const missingEnv = requiredEnv.filter(key => !process.env[key]);
  if (missingEnv.length > 0) {
    console.warn(`⚠️ WARNING: Missing environment variables: ${missingEnv.join(", ")}`);
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Serve the last generated image for automation to download
  app.get("/api/automation/image", (req, res) => {
    if (!lastGeneratedImage) {
      return res.status(404).send("No image generated yet");
    }
    res.set("Content-Type", "image/jpeg");
    res.send(lastGeneratedImage);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
