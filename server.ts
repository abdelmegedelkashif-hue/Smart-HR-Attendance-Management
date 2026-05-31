import rateLimit from 'express-rate-limit';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Gemini SDK with telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
} else {
  console.warn("⚠️ Warning: GEMINI_API_KEY is not defined. AI OCR and analytics features will fall back to simulated mock behaviors.");
}

async function startServer() {
  const app = express();
  
  // High payload limit for image OCR uploads (base64)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Middleware to inject API status context to frontend
  app.get('/api/status', (req, res) => {
    res.json({
      aiAvailable: !!ai,
      message: ai ? "Smart Gemini OCR Service Active" : "Simulated AI Mode Active (API key required)",
    });
  });

  // 1. OCR Endpoint: Extracts attendance table from a photo using Gemini 3.5 Flash
  app.post('/api/ocr', async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image || !mimeType) {
        return res.status(400).json({ error: "Missing image data or mimeType" });
      }

      // If Gemini is not set up, return simulated high-fidelity mock data to prevent blocking
      if (!ai) {
        console.log("No Gemini API key available. Generating simulated high-fidelity OCR results...");
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate latency
        return res.json({
          extractedRecords: [
            { employeeId: "EMP-101", employeeName: "محمد علي جابر", date: "2026-05-31", checkIn: "08:02-Cairo", checkOut: "16:05" },
            { employeeId: "EMP-103", employeeName: "أميرة محمود", date: "2026-05-31", checkIn: "08:15", checkOut: "16:00" },
            { employeeId: "EMP-104", employeeName: "خالد سعيد", date: "2026-05-31", checkIn: "07:55", checkOut: "17:30" },
            { employeeId: "EMP-105", employeeName: "ياسر رضوان", date: "2026-05-31", checkIn: "08:45-Late", checkOut: "15:45-Early" },
            { employeeId: "EMP-107", employeeName: "نورهان حسن", date: "2026-05-31", checkIn: "08:00", checkOut: "16:10" }
          ]
        });
      }

      // Prepare image block for Google GenAI SDK
      // The image payload from the request should be the raw base64 string (without the data:image/png;base64, prefix)
      const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

      const imagePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      };

      const systemInstruction = 
        "You are an expert HR OCR system capable of scanning tables from images, worksheets, whiteboards, or digital attendance documents.\n" +
        "Extract the following tabular data columns accurately:\n" +
        "- employeeId: Unique employee identifier if present (e.g. EMP-101), or attempt to deduce. If missing, leave empty.\n" +
        "- employeeName: Full name of the employee. Read Arabic or English values precisely.\n" +
        "- date: Date of attendance in YYYY-MM-DD. If year is missing, assume 2026.\n" +
        "- checkIn: Daily entry time in 24h HH:mm format (e.g., '08:15' or '17:30'). Set null if absent.\n" +
        "- checkOut: Daily departure time in 24h HH:mm format (e.g., '16:05' or '01:00'). Set null if absent or not logged.\n\n" +
        "Be careful with hand-written scans or bad tables. Correct clear typos. Translate or format appropriately. Only return valid JSON array conforming to the schema.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          imagePart,
          { text: "Generate structured attendance logs in JSON array format from this scanned manual attendance sheet." }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractedRecords: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    employeeId: { type: Type.STRING },
                    employeeName: { type: Type.STRING },
                    date: { type: Type.STRING },
                    checkIn: { type: Type.STRING },
                    checkOut: { type: Type.STRING }
                  },
                  required: ["employeeName", "date"]
                }
              }
            },
            required: ["extractedRecords"]
          }
        }
      });

      const parsedData = JSON.parse(response.text || "{}");
      res.json(parsedData);

    } catch (err: any) {
      console.error("AI OCR Error:", err);
      res.status(500).json({ error: err.message || "Failed to parse document via AI Vision" });
    }
  });

  // 2. AI Analytics Endpoint: Analyzes logs and generates intelligent alerts & recommendations
  app.post('/api/analyse', async (req, res) => {
    try {
      const { attendanceData, employeesData, dailyLaborData } = req.body;

      if (!attendanceData) {
        return res.status(400).json({ error: "Missing attendance data context" });
      }

      // Simulated mock if no API key is available
      if (!ai) {
        console.log("No Gemini API key available. Generating simulated analysis report...");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return res.json({
          absenteeismMetrics: {
            overallRating: "92% Attendance Rate",
            notes: "Overall attendance is highly prompt, with Minor delay spikes in Cairo HQ and Capital project."
          },
          delaysTrend: "Engineering and site operations departments recorded most minor delay times (avg 15m) due to site transport constraints.",
          anomalies: [
            { type: "Missing Checkout", message: "EMP-103 missed checking out on 2026-05-31", severity: "Warning" },
            { type: "Frequent Delays", message: "EMP-105 (ياسر رضوان) has been late more than 3 times this week.", severity: "Critical" }
          ],
          recommendations: [
            "Provide site shuttle options to the New Capital City site to eliminate the average 20-minute morning delay.",
            "Establish automated SMS notifications for missing checkouts at 18:00.",
            "Acknowledge EMP-104 for perfect punctuality (100% early check-in average)."
          ],
          outstandingEmployees: ["خالد سعيد (EMP-104)", "نورهان حسن (EMP-107)"],
          reportDraftAr: "إن التزام الموظفين بالضوابط متميز للغاية بنسبة 92%. التحدي الرئيسي يتمثل في الوردية الصباحية لموقع العاصمة الإدارية نتيجة الازدحام المروري، وننصح بتقديم حافلات مخصصة. الموظف خالد سعيد متميز ومثال يحتذى به.",
          reportDraftEn: "Punctuality sits at an impressive 92%. The bottleneck lies within the morning shift transit to the New Administrative Capital site. Providing company shuttle alternatives will mitigate late arrivals. High marks to Khalid Saeed for perfect attendance."
        });
      }

      const promptContext = 
        `Here is the active business state to diagnose:\n` +
        `Employees database list count: ${employeesData ? employeesData.length : 0}\n` +
        `Current Attendance Logs details (JSON format): \n${JSON.stringify(attendanceData.slice(0, 100))}\n` +
        `Daily Labor counts: ${dailyLaborData ? dailyLaborData.length : 0} active workers.\n\n` +
        `Perform advanced analytics on this data. Detect anomalies, compute absenteeism ratings, identify frequent late-comers, find missing checkout violations, target top performers, and compose bilingual summaries (Arabic and English) for the executive review table.`;

      const systemInstruction = 
        "You are an AI Smart HR specialist. Your goal is to review business attendance sheets and generate critical insights.\n" +
        "You must return a secure JSON structure with exact properties:\n" +
        "- absenteeismMetrics: Object with overallRating string (e.g. '88% Punctuality') and brief notes.\n" +
        "- delaysTrend: Short string diagnosing departments or sites causing bottlenecks.\n" +
        "- anomalies: Array of alert objects where each object has type string, message string, and severity string ('Warning' or 'Critical').\n" +
        "- recommendations: Array of string actionable suggestions.\n" +
        "- outstandingEmployees: Array of string employee names with zero tardiness.\n" +
        "- reportDraftAr: A formal and beautiful paragraph in Arabic summarizing the audit.\n" +
        "- reportDraftEn: A formal executive summary paragraph in English.\n\n" +
        "Perform realistic analysis on the input array data. Return ONLY the requested JSON shape.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptContext,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              absenteeismMetrics: {
                type: Type.OBJECT,
                properties: {
                  overallRating: { type: Type.STRING },
                  notes: { type: Type.STRING }
                },
                required: ["overallRating", "notes"]
              },
              delaysTrend: { type: Type.STRING },
              anomalies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    message: { type: Type.STRING },
                    severity: { type: Type.STRING }
                  },
                  required: ["type", "message", "severity"]
                }
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              outstandingEmployees: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              reportDraftAr: { type: Type.STRING },
              reportDraftEn: { type: Type.STRING }
            },
            required: ["absenteeismMetrics", "delaysTrend", "anomalies", "recommendations", "outstandingEmployees", "reportDraftAr", "reportDraftEn"]
          }
        }
      });

      const parsedResult = JSON.parse(response.text || "{}");
      res.json(parsedResult);

    } catch (err: any) {
      console.error("AI Analytics Error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze data via Gemini Intelligence" });
    }
  });

  // Integration of Vite Development Server Middleware or production client serving
  const isProd = process.env.NODE_ENV === 'production';
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve client static files from 'dist' folder
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // حد أقصى 100 طلب من نفس الآي بي
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// تطبيق الحماية على السيرفر
        if (fs.existsSync(distPath)) {
            app.use(express.static(distPath));
            
            // بنحط الـ limiter هنا كـ Middleware عشان يحمي الـ Route ده بالظبط
            app.get('*', limiter, (req, res) => {
                res.sendFile(path.resolve(distPath, 'index.html'));
            });
        }

  // Bind to port 3000 as strictly demanded by platform reverse proxy
  app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Smart HRMS Cloud Services running on http://0.0.0.0:3000');
  });
}

startServer().catch((error) => {
  console.error("Failed to boot server:", error);
});
