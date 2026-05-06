import { GoogleGenAI, Modality, ThinkingLevel, Type, GenerateContentResponse, LiveServerMessage } from "@google/genai";

// Initialize the SDK lazily to ensure it uses the latest API key
const getAI = (apiKey?: string) => {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export const generateChatResponse = async (
  message: string,
  history: { role: string; parts: { text: string }[] }[] = [],
  model: string = "gemini-3-flash-preview",
  systemInstruction: string = "You are a helpful AI assistant."
) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
    },
    history,
  });
  const response = await chat.sendMessage({ message });
  return response;
};

export const generateImage = async (
  prompt: string,
  config: {
    model?: string;
    aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "1:8" | "4:1" | "8:1" | "2:3" | "3:2" | "21:9";
    imageSize?: "512px" | "1K" | "2K" | "4K";
  } = {}
) => {
  const { model = "gemini-3.1-flash-image-preview", aspectRatio = "1:1", imageSize = "1K" } = config;
  const ai = getAI();
  
  const response = await ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: imageSize as any,
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated.");
};

export const generateVideo = async (
  prompt: string,
  config: {
    model?: string;
    aspectRatio?: "16:9" | "9:16";
    resolution?: "720p" | "1080p";
    image?: { data: string; mimeType: string };
  } = {}
) => {
  const { model = "veo-3.1-fast-generate-preview", aspectRatio = "16:9", resolution = "1080p" } = config;
  const ai = getAI();

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    image: config.image ? { imageBytes: config.image.data, mimeType: config.image.mimeType } : undefined,
    config: {
      numberOfVideos: 1,
      resolution,
      aspectRatio,
    },
  });

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");

  const response = await fetch(downloadLink, {
    method: "GET",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY!,
    },
  });
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const generateMusic = async (
  prompt: string,
  model: "lyria-3-clip-preview" | "lyria-3-pro-preview" = "lyria-3-clip-preview"
) => {
  const ai = getAI();
  const response = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      responseModalities: [Modality.AUDIO],
    },
  });

  let audioBase64 = "";
  let mimeType = "audio/wav";

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioBase64 += part.inlineData.data;
      }
    }
  }

  if (!audioBase64) throw new Error("No music generated.");

  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
};

export const generateTTS = async (text: string, voice: string = "Kore") => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("TTS failed.");

  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "audio/pcm;rate=24000" });
  return URL.createObjectURL(blob);
};

export const searchGrounding = async (query: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  return response;
};

export const mapsGrounding = async (query: string, lat?: number, lng?: number) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: query,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: lat && lng ? { latitude: lat, longitude: lng } : undefined,
        },
      },
    },
  });
  return response;
};

export const thinkingResponse = async (query: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: query,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });
  return response;
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = "audio/wav") => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this audio." },
      ],
    },
  });
  return response.text;
};

export const evaluateExam = async (
  questionPaper: { data: string; mimeType: string },
  markingScheme: { data: string; mimeType: string },
  studentBooklet: { data: string; mimeType: string }
) => {
  const ai = getAI();
  const prompt = `
    You are an expert examiner. I am providing you with three documents:
    1. A Question Paper.
    2. A Marking Scheme / Correct Answers.
    3. A Student's Submission (Handwritten, Typed, or Scanned).

    Your task is to:
    - The documents provided (Question Paper, Marking Scheme, Student Booklet) may be in any language.
    - Transcribe or read the student's answers (handle handwriting or typed text) in their original language.
    - Compare each answer with the marking scheme and the question paper, regardless of the language used.
    - IMPORTANT: If the subject or the topic in the student's answer booklet is not related to the question paper, assign zero marks for all questions and provide feedback explaining the mismatch.
    
    HUMAN-LIKE CORRECTION PRINCIPLES:
    - SEMANTIC FLEXIBILITY: Award full or near-full marks for conceptually correct, related, or alternative valid answers. Do not penalize for using synonyms or alternative phrasing that carries the same scientific or logical meaning as the marking scheme.
    - REWARD INTENT: If a student clearly understands the core concept but makes minor execution errors (e.g., a spelling mistake in a technical term, or a single calculation error in a complex multi-step problem), award significant partial marks.
    - LOGICAL PATHWAY: In technical subjects (Math/Science), evaluate the student's step-by-step logic. If the reasoning is correct but the final answer is wrong due to a minor carry-over error, award marks for the correct logic steps.
    - PARTIAL CREDIT: Award partial marks based on the quality of reasoning and the percentage of relevant knowledge demonstrated.
    - FEEDBACK: Provide helpful feedback in English. If marks were awarded for related/alternative answers, explain the reasoning behind this "Human-like" adjustment.
    - Calculate the total marks based on these flexible principles.

    Return the result in JSON format with the following structure:
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
          "boundingBox": [ymin, xmin, ymax, xmax] // Normalized 0-1000 for the answer's location in the student booklet
        }
      ]
    }
  `;

  try {
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
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
        ],
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

    const text = response.text;
    if (!text) {
      // Check for common finish reasons
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === "SAFETY") {
        throw new Error("AI_ERROR_SAFETY: The AI safety filter was triggered. This can happen if the documents contain sensitive or restricted content.");
      }
      if (candidate?.finishReason === "RECITATION") {
        throw new Error("AI_ERROR_RECITATION: The AI detected copyrighted material and blocked the response.");
      }
      throw new Error("AI_ERROR_EMPTY: The AI returned an empty response. This usually happens if the handwriting is too unclear or the images are too blurry to process.");
    }

    try {
      const result = JSON.parse(text);
      
      // Helper to ensure valid numbers for Firestore
      const ensureValidNumber = (val: any, fallback: number = 0): number => {
        const num = Number(val);
        return (typeof num === 'number' && !isNaN(num)) ? num : fallback;
      };

      // Ensure totalMarks and maxMarks are valid numbers
      result.totalMarks = ensureValidNumber(result.totalMarks, 0);
      result.maxMarks = ensureValidNumber(result.maxMarks, 0);
      
      // Ensure questions array exists and has valid numeric fields
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
    } catch (e) {
      console.error("AI Response was not valid JSON:", text);
      throw new Error("AI_ERROR_FORMAT: The AI returned an unreadable response format. This often happens if the documents are too complex or the scan quality is low.");
    }
  } catch (error: any) {
    if (error.message?.includes("AI_ERROR_")) throw error;
    
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      throw new Error("AI_ERROR_QUOTA: AI service quota exceeded. Please wait a moment and try again.");
    }
    if (error.message?.includes("500") || error.message?.includes("server error")) {
      throw new Error("AI_ERROR_SERVER: The AI server encountered an error. Please try again later.");
    }
    
    throw error;
  }
};

export const extractStudentDetails = async (
  studentBooklet: { data: string; mimeType: string }
) => {
  const ai = getAI();
  const prompt = `
    You are an expert administrative assistant. I am providing you with the first page of a student's exam booklet.
    Your task is to extract the student's details from this page.
    The document may be in any language. Identify the student details regardless of the language used for the labels (e.g., "Name" in English, "Nombre" in Spanish, "Nom" in French, "नाम" in Hindi, etc.).
    Look for fields like "Name", "Student Name", "Candidate Name", "ID", "Roll Number", "Student ID", etc.

    Return the result in JSON format with the following structure:
    {
      "studentName": string,
      "studentId": string (optional),
      "otherDetails": object (optional)
    }
    If you cannot find a name, return an empty string for studentName.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: studentBooklet },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
        ],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING },
            studentId: { type: Type.STRING },
            otherDetails: { type: Type.OBJECT }
          },
          required: ["studentName"]
        }
      },
    });

    const text = response.text;
    if (!text) {
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === "SAFETY") {
        throw new Error("AI_ERROR_SAFETY: The AI safety filter was triggered.");
      }
      throw new Error("AI_ERROR_EMPTY: The AI could not read the student details. The image might be too blurry or the handwriting unclear.");
    }

    try {
      const result = JSON.parse(text);
      if (typeof result.studentName !== 'string') result.studentName = "";
      return result;
    } catch (e) {
      console.error("AI Response was not valid JSON:", text);
      throw new Error("AI_ERROR_FORMAT: The AI returned an unreadable response format.");
    }
  } catch (error: any) {
    if (error.message?.includes("AI_ERROR_")) throw error;
    
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      throw new Error("AI_ERROR_QUOTA: AI service quota exceeded.");
    }
    if (error.message?.includes("500") || error.message?.includes("server error")) {
      throw new Error("AI_ERROR_SERVER: The AI server encountered an error.");
    }
    
    throw error;
  }
};
