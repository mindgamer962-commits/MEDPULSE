import "dotenv/config";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import {
  getPHCs,
  getMedicines,
  predictStockOut,
  getFootfallStats
} from "./src/services/db.js";

const app = express();
app.use(express.json());


const PORT = 3000;

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
  const { phcId, medicineId } = req.body;

  if (!phcId || !medicineId) {
    return res.status(400).json({ error: "phcId and medicineId are required parameters." });
  }

  try {
    // 1. Resolve metadata names
    const phcs = await getPHCs();
    const medicines = await getMedicines();

    const phc = phcs.find((p) => p.phc_id === phcId);
    const med = medicines.find((m) => m.medicine_id === medicineId);

    if (!phc || !med) {
      return res.status(404).json({ error: "PHC or Medicine not found in database." });
    }

    // 2. Fetch calculations dynamically from Firestore (Single Source of Truth)
    const stockOut = await predictStockOut(phcId, medicineId);

    if (stockOut.error) {
      return res.json({
        explanation: "Insufficient historical data for reliable forecasting.",
        generatedAt: new Date(),
        model: "gemini-2.5-flash",
        available: true
      });
    }

    // Fetch footfall stats
    const footfallStats = await getFootfallStats(phcId);

    // 3. Structured input for Gemini
    const geminiInput = {
      phcName: phc.name,
      district: phc.district,
      medicineName: med.name,
      unit: med.unit,
      currentStock: stockOut.currentStock,
      predicted7DayDemand: stockOut.predicted7DayDemand,
      averageDailyDemand: stockOut.averageDailyDemand,
      estimatedDaysRemaining: stockOut.estimatedDaysRemaining,
      projectedStockOutDate: stockOut.stockOutDate,
      riskLevel: stockOut.riskLevel,
      recentFootfallTrend: footfallStats.trend,
      recentFootfallAverage: footfallStats.last7DaysAvg,
      previousFootfallAverage: footfallStats.prev7DaysAvg
    };

    console.log(`Sending runtime data to Gemini for ${phc.name} - ${med.name}`);

    // 4. Safe AI call handling
    if (!aiClient) {
      console.warn("Gemini client not initialized (missing API Key). Returning fallback.");
      return res.json({
        explanation: null,
        available: false
      });
    }

    const systemInstruction = `You are MedPulse's clinical supply-chain explanation assistant.
Your role is to explain already-calculated inventory and demand-risk results to a health officer.
You MUST treat every numeric value in the provided data as authoritative.
You MUST NOT recalculate, alter, contradict, or invent numbers.
You MUST NOT make procurement, treatment, or medical decisions.
You MUST NOT invent causes that are not supported by the provided data.

Explain:
1. What is happening.
2. What evidence in the supplied data explains the risk.
3. What the health officer should pay attention to.

If the data shows increasing patient footfall and increasing medicine demand, explain that relationship.
If stock is insufficient for projected demand, explain the stock-out risk.
If the risk is low, explain why the situation appears stable.
If information is missing, explicitly say that the available data is insufficient.

Keep the explanation concise, factual, and operational.
Do not recommend a specific transfer or source PHC. Redistribution is handled separately by MedPulse.
Return ONLY the explanation text.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Here is the structured input data:\n${JSON.stringify(geminiInput, null, 2)}`,
      config: {
        systemInstruction
      }
    });

    const explanation = response.text ? response.text.trim() : "";

    // 5. Output Validation
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

app.listen(PORT, () => {
  console.log(`MedPulse Server running on http://localhost:${PORT}`);
});
