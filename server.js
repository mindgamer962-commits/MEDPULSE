import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import {
  getPHCs,
  getMedicines,
  predictStockOut,
  getFootfallStats
} from "./src/services/db.js";

import {
  buildMultiResourceGeminiContext,
  GEMINI_SYSTEM_INSTRUCTION
} from "./src/services/geminiContext.js";

const app = express();
app.use(express.json());

const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));

const PORT = process.env.PORT || 3000;

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient = null;

if (geminiApiKey) {
  console.log("Gemini API Key detected. Initializing Gemini client...");
  aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing.");
}

app.post("/api/ai/explanation", async (req, res) => {
  const { phcId, medicineId, targetDate, admissionRate } = req.body;

  if (!phcId) {
    return res.status(400).json({ error: "phcId is a required parameter." });
  }

  try {
    // 1. Build authoritative multi-resource context from deterministic services
    const geminiInput = await buildMultiResourceGeminiContext({
      phcId,
      medicineId,
      targetDate: targetDate || "2026-09-14",
      admissionRate: typeof admissionRate === "number" ? admissionRate : 8
    });

    console.log(`Sending multi-resource operational data to Gemini for ${geminiInput.facility.phcName}`);

    // 2. Safe AI call handling
    if (!aiClient) {
      console.warn("Gemini client not initialized (missing API Key). Returning fallback.");
      return res.json({
        explanation: null,
        available: false
      });
    }

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Here is the structured operational input data:\n${JSON.stringify(geminiInput, null, 2)}`,
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION
      }
    });

    const explanation = response.text ? response.text.trim() : "";

    // 3. Output Validation
    if (!explanation || explanation.length < 10) {
      throw new Error("Empty or malformed explanation generated.");
    }
    if (explanation.length > 1500) {
      throw new Error("Explanation length exceeds the maximum safety limit.");
    }

    return res.json({
      explanation,
      generatedAt: new Date(),
      model: "gemini-2.5-flash",
      available: true
    });

  } catch (err) {
    console.error("Gemini API call or validation failed:", err);
    // Return gracefully to prevent breaking the application flow
    return res.json({
      explanation: null,
      available: false
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MedPulse Server running on port ${PORT}`);
});
