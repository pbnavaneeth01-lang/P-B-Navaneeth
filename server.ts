import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { GRADEMASTER_ENGINE_V1, getSystemInstruction } from "./src/lib/ai-engine-registry";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // --- Gemini Setup ---
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Helper for retrying AI calls
  const withRetry = async <T>(fn: () => Promise<T>, retries: number = 2, delay: number = 2000): Promise<T> => {
    try {
      return await fn();
    } catch (error: any) {
      const errMsg = error.message?.toLowerCase() || "";
      const isRetriable = !errMsg || 
        errMsg.includes("500") || 
        errMsg.includes("server error") || 
        errMsg.includes("quota") || 
        errMsg.includes("429") || 
        errMsg.includes("timeout") || 
        errMsg.includes("fetch") || 
        errMsg.includes("network") ||
        errMsg.includes("econnreset") ||
        errMsg.includes("overloaded");

      if (retries > 0 && isRetriable) {
        console.warn(`AI call failed, retrying in ${delay}ms... (${retries} retries left). Error context: ${error.message || "Unknown"}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 1.5);
      }
      throw error;
    }
  };

  // --- API Routes ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/gemini/evaluate", async (req, res) => {
    console.log("POST /api/gemini/evaluate - Starting evaluation");
    try {
      if (!process.env.GEMINI_API_KEY) {
        console.error("Evaluation Error: GEMINI_API_KEY is missing");
        return res.status(500).json({ error: "GEMINI_API_KEY is missing in server environment." });
      }

      const { questionPaper, markingScheme, studentBooklet } = req.body;

      if (!questionPaper || !markingScheme || !studentBooklet) {
        return res.status(400).json({ error: "Missing document data" });
      }

      const result = await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: "DOCUMENT 1: [QUESTION_PAPER]" },
                { inlineData: questionPaper },
                { text: "DOCUMENT 2: [MARKING_SCHEME]" },
                { inlineData: markingScheme },
                { text: "DOCUMENT 3: [STUDENT_BOOKLET]" },
                { inlineData: studentBooklet },
                { text: `Initiate high-precision evaluation sequence for ${GRADEMASTER_ENGINE_V1.name}. Follow the Marking Protocol with extreme rigor.` },
              ],
            },
          ],
          config: {
            systemInstruction: getSystemInstruction(GRADEMASTER_ENGINE_V1),
            responseMimeType: "application/json",
            temperature: 0,
            seed: 42,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                totalMarks: { type: Type.NUMBER },
                maxMarks: { type: Type.NUMBER },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.STRING },
                      transcription: { type: Type.STRING },
                      marksAwarded: { type: Type.NUMBER },
                      maxMarks: { type: Type.NUMBER },
                      feedback: { type: Type.STRING },
                      pageNumber: { type: Type.NUMBER },
                      boundingBox: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER }
                      }
                    },
                    required: ["questionNumber", "transcription", "marksAwarded", "maxMarks", "feedback", "pageNumber", "boundingBox"]
                  }
                }
              },
              required: ["summary", "totalMarks", "maxMarks", "questions"]
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' } as any,
            ],
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error("AI_ERROR_EMPTY");
        }
        return JSON.parse(text);
      });

      res.json(result);
    } catch (error: any) {
      console.error("Server Evaluation Error:", error);
      res.status(500).json({ error: String(error.message || "Evaluation failed") });
    }
  });

  app.post("/api/gemini/extract-details", async (req, res) => {
    console.log("POST /api/gemini/extract-details - Starting extraction");
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing in server environment." });
      }

      const { studentBooklet } = req.body;
      if (!studentBooklet) {
        return res.status(400).json({ error: "Missing document data" });
      }

      const result = await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: studentBooklet },
                { text: "Analyze the provided cover page image or document. Extract the student's name, ID/USN, and available school/class details. Ensure you search both printed and handwritten text under the GradeMaster Identity Extraction Protocol." },
              ],
            },
          ],
          config: {
            systemInstruction: `
              You are GradeMaster AI Identity Subsystem, a high-precision administrative entity. 
              Your absolute goal is to locate, transcribe, and return the student's name and registration identifier from the cover page of an exam booklet.

              IDENTITY EXTRACTION PROTOCOLS:
              1. STUDENT NAME PARSING:
                 - Examine the document for structured lines, boxes, tables, or label fields.
                 - Search for English name labels and text headers: "Name", "Student Name", "Candidate Name", "Name of the Candidate", "Name of the Student", "Candidate's Name", "Pupil Name", "NAME IN BLOCK LETTERS".
                 - Fully support Indian/regional language and bilingual booklet covers. Check next to these labels:
                   - Kannada: "ಹೆಸರು" (Hesaru) or "ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರು"
                   - Hindi: "नाम" (Naam) or "छात्र का नाम"
                   - Malayalam: "പേര്" (Perr) or "വിനാർത്ഥിയുടെ പേര്"
                   - Tamil: "பெயர்" (Peyar) or "மாணவர் பெயர்"
                   - Telugu: "పేరు" (Peru) or "విద్యార్థి పేరు"
                 - Locate the handwritten, filled-in, or printed text adjacent to or inside the box corresponds to these labels.
                 - If no obvious name label is found, check for handwritten words that resemble standard human individual names (e.g., "Rahul Kumar", "Anjali S.", "John Doe") located anywhere on the page, or the student signature area.
                 - Clean prefixes or residual label marks (e.g. remove "Name of the Candidate :").

              2. STUDENT ID / USN / ROLL NO PARSING:
                 - Search for fields labeled: "USN", "Roll No", "Roll Number", "Register No", "Register Number", "Registration Number", "Student ID", "ID", "Seat No", "Exam Number".
                 - Fully support regional labels like: "ನೋಂದಣಿ ಸಂಖ್ಯೆ", "अनुक्रमांक", "രജിസ്റ്റർ നമ്പർ", "பதிవు எண்".
                 - Extract the combination of alphanumeric characters representing this identifier.

              3. OTHER ACADEMIC METADATA:
                 - Look for "Branch" (e.g., Mechanical Engineering, CSE, Science), "Semester" (e.g., V, 5th, 4), and "Section" (e.g., A, B).
                 - Map these to the otherDetails object fields.

              OUTPUT RULE: Always yield a valid JSON object matching the schema. The "studentName" must NOT be empty; if no name is clearly labeled but hand-written candidate text is detected, extract that text as the best estimate of "studentName". Use "John Doe" or a descriptive guess only as a last resort.
            `,
            responseMimeType: "application/json",
            seed: 1337,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                studentName: { type: Type.STRING },
                studentId: { type: Type.STRING },
                otherDetails: { 
                  type: Type.OBJECT,
                  properties: {
                    branch: { type: Type.STRING },
                    semester: { type: Type.STRING },
                    section: { type: Type.STRING }
                  }
                }
              },
              required: ["studentName"]
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' } as any,
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' } as any,
            ],
          },
        });

        const text = response.text;
        if (!text) return { studentName: "", studentId: "", otherDetails: {} };
        return JSON.parse(text);
      });

      res.json(result);
    } catch (error: any) {
      console.error("Server Details Extraction Error:", error);
      res.status(500).json({ error: String(error.message || "Extraction failed") });
    }
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
