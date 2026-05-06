import { GoogleGenAI, Modality, ThinkingLevel, Type, GenerateContentResponse, LiveServerMessage } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Initialize the SDK lazily to ensure it uses the latest API key
const getAIConfig = () => {
  if (typeof window === 'undefined') return { provider: 'google', key: process.env.GEMINI_API_KEY };
  
  const provider = localStorage.getItem("AI_PROVIDER") || "google";
  const customKey = localStorage.getItem("USER_GEMINI_KEY");
  const key = customKey || (
    provider === 'google' ? process.env.GEMINI_API_KEY : 
    provider === 'openai' ? process.env.OPENAI_API_KEY :
    process.env.ANTHROPIC_API_KEY
  );
  
  return { provider, key };
};

const getGeminiAI = (apiKey?: string) => {
  const { key } = getAIConfig();
  const finalKey = apiKey || key;
  if (!finalKey) {
    throw new Error("Gemini API Key is not set. Please provide it in Settings.");
  }
  return new GoogleGenAI({ apiKey: finalKey });
};

const getOpenAI = (apiKey?: string) => {
  const { key } = getAIConfig();
  const finalKey = apiKey || key;
  if (!finalKey) {
    throw new Error("OpenAI API Key is not set. Please provide it in Settings.");
  }
  return new OpenAI({ apiKey: finalKey, dangerouslyAllowBrowser: true });
};

const getAnthropicAI = (apiKey?: string) => {
  const { key } = getAIConfig();
  const finalKey = apiKey || key;
  if (!finalKey) {
    throw new Error("Anthropic API Key is not set. Please provide it in Settings.");
  }
  // Anthropic browser usage requires a proxy or specific handling, 
  // but for AI Studio preview (which has server-side proxying for process.env) it might work.
  // Actually, Anthropic SDK usually errors in browser without a proxy.
  return new Anthropic({ apiKey: finalKey, dangerouslyAllowBrowser: true });
};

// ... existing generate functions (chat, image, etc. mostly gemini-specific for now) ...

export const evaluateExam = async (
  questionPaper: { data: string; mimeType: string },
  markingScheme: { data: string; mimeType: string },
  studentBooklet: { data: string; mimeType: string }
) => {
  const { provider } = getAIConfig();
  const prompt = `
    You are an expert examiner. I am providing you with three documents:
    1. A Question Paper.
    2. A Marking Scheme / Correct Answers.
    3. A Student's Submission (Handwritten, Typed, or Scanned).

    Your task is to:
    - The documents provided may be in any language.
    - Transcribe or read the student's answers (handle handwriting) in their original language.
    - Compare each answer with the marking scheme.
    - IMPORTANT: If the subject is not related to the question paper, assign zero marks.
    
    HUMAN-LIKE CORRECTION PRINCIPLES:
    - SEMANTIC FLEXIBILITY: Award marks for conceptually correct alternative valid answers.
    - REWARD INTENT: If a student clearly understands but makes minor execution errors, award significant partial marks.
    - LOGICAL PATHWAY: In technical subjects, evaluate step-by-step logic.
    - PARTIAL CREDIT: Award partial marks based on quality of reasoning.
    - FEEDBACK: Provide helpful feedback in English.

    Return the result in JSON format with exactly this structure:
    {
      "totalMarks": number,
      "maxMarks": number,
      "questions": [
        {
          "questionNumber": string,
          "transcription": string,
          "marksAwarded": number,
          "maxMarks": number,
          "feedback": string,
          "pageNumber": number,
          "boundingBox": [ymin, xmin, ymax, xmax]
        }
      ]
    }
  `;

  if (provider === "openai") {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${questionPaper.mimeType};base64,${questionPaper.data}` } },
            { type: "image_url", image_url: { url: `data:${markingScheme.mimeType};base64,${markingScheme.data}` } },
            { type: "image_url", image_url: { url: `data:${studentBooklet.mimeType};base64,${studentBooklet.data}` } },
          ],
        },
      ],
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return normalizeEvaluationResult(result);
  } else if (provider === "anthropic") {
    const anthropic = getAnthropicAI();
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt + "\n\nIMPORTANT: Return ONLY valid JSON." },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: questionPaper.mimeType as any,
                data: questionPaper.data,
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: markingScheme.mimeType as any,
                data: markingScheme.data,
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: studentBooklet.mimeType as any,
                data: studentBooklet.data,
              },
            },
          ],
        },
      ],
    });

    // Claude returns text blocks, we need to extract the JSON
    const text = message.content.filter(c => c.type === 'text').map(t => t.text).join("");
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const result = JSON.parse(text.substring(jsonStart, jsonEnd));
    return normalizeEvaluationResult(result);
  } else {
    // Google Gemini Logic
    const ai = getGeminiAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: {
        parts: [
          { inlineData: questionPaper },
          { inlineData: markingScheme },
          { inlineData: studentBooklet },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
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
                required: ["questionNumber", "transcription", "marksAwarded", "maxMarks", "feedback"]
              }
            }
          },
          required: ["totalMarks", "maxMarks", "questions"]
        }
      },
    });

    return normalizeEvaluationResult(JSON.parse(response.text));
  }
};

const normalizeEvaluationResult = (result: any) => {
  const ensureValidNumber = (val: any, fallback: number = 0): number => {
    const num = Number(val);
    return (typeof num === 'number' && !isNaN(num)) ? num : fallback;
  };

  result.totalMarks = ensureValidNumber(result.totalMarks, 0);
  result.maxMarks = ensureValidNumber(result.maxMarks, 0);
  
  if (!Array.isArray(result.questions)) {
    result.questions = [];
  } else {
    result.questions = result.questions.map((q: any) => ({
      ...q,
      marksAwarded: ensureValidNumber(q.marksAwarded, 0),
      maxMarks: ensureValidNumber(q.maxMarks, 0),
      pageNumber: ensureValidNumber(q.pageNumber, 1),
      boundingBox: Array.isArray(q.boundingBox) ? q.boundingBox.map((b: any) => ensureValidNumber(b, 0)) : undefined
    }));
  }
  return result;
};

export const extractStudentDetails = async (
  studentBooklet: { data: string; mimeType: string }
) => {
  const { provider } = getAIConfig();
  const prompt = `
    Extract student's name and ID from this exam booklet front page.
    The document may be in any language.
    Return JSON: { "studentName": string, "studentId": string }
  `;

  if (provider === "openai") {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${studentBooklet.mimeType};base64,${studentBooklet.data}` } },
          ],
        },
      ],
    });
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return { studentName: result.studentName || "Unknown", studentId: result.studentId || "" };
  } else if (provider === "anthropic") {
    const anthropic = getAnthropicAI();
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt + "\n\nIMPORTANT: Return ONLY valid JSON." },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: studentBooklet.mimeType as any,
                data: studentBooklet.data,
              },
            },
          ],
        },
      ],
    });
    const text = message.content.filter(c => c.type === 'text').map(t => t.text).join("");
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const result = JSON.parse(text.substring(jsonStart, jsonEnd));
    return { studentName: result.studentName || "Unknown", studentId: result.studentId || "" };
  } else {
    const ai = getGeminiAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{ inlineData: studentBooklet }, { text: prompt }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING },
            studentId: { type: Type.STRING }
          },
          required: ["studentName"]
        }
      },
    });
    return JSON.parse(response.text);
  }
};
