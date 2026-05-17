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
  model: string = "gemini-flash-latest",
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
  const { model = "veo-3.1-lite-generate-preview", aspectRatio = "16:9", resolution = "1080p" } = config;
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
    model: "gemini-3.1-flash-tts-preview",
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
    model: "gemini-flash-latest",
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
    model: "gemini-flash-latest",
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
    // ThinkingLevel is not available for gemini-3.1-pro-preview, it is handled internally
  });
  return response;
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = "audio/wav") => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this audio." },
      ],
    },
  });
  return response.text;
};

// Helper for retrying AI calls on transient errors
const withRetry = async <T>(fn: () => Promise<T>, retries: number = 2, delay: number = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes("500") || error.message?.includes("server error") || error.message?.includes("quota") || error.message?.includes("429"))) {
      console.warn(`AI call failed, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
};

export const evaluateExam = async (
  questionPaper: { data: string; mimeType: string },
  markingScheme: { data: string; mimeType: string },
  studentBooklet: { data: string; mimeType: string }
) => {
  // Offline simulation
  if (!navigator.onLine) {
    console.warn("Offline: Returning simulated evaluation result.");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      totalMarks: 42,
      maxMarks: 50,
      questions: [
        {
          questionNumber: "1",
          transcription: "[Offline View] The student provided a detailed response regarding the fundamental principles of the topic...",
          marksAwarded: 8,
          maxMarks: 10,
          feedback: "Good understanding shown. (Note: AI evaluation simulated while offline)",
          pageNumber: 1
        },
        {
          questionNumber: "2",
          transcription: "[Offline View] Mathematical derivation followed standard procedures...",
          marksAwarded: 10,
          maxMarks: 10,
          feedback: "Perfect derivation. (Note: AI evaluation simulated while offline)",
          pageNumber: 1
        }
      ]
    };
  }

  const ai = getAI();
  const prompt = `
    You are an elite academic examiner with multi-lingual expertise and a high precision for handwriting recognition. 
    I am providing you with three critical documents:
    1. A Question Paper.
    2. A Marking Scheme / Reference Answers.
    3. A Student's Submission (Can be HANDWRITTEN in cursive/printed, TYPED, or SCANNED).

    YOUR CORE MANDATE:
    - DISCERNING HANDWRITING: You must be extremely diligent in reading handwriting (cursive, messy, faint). If a word is truly illegible, use '[...]' for that word but continue transcribing. Never skip entire paragraphs just because one word is difficult.
    - MULTI-LANGUAGE FLUENCY: The documents may be in ANY language or mixed. Read in native script, evaluate against the marking scheme, and transcribe exactly what is written.
    - UNIVERSAL ACCEPTANCE: Accept and evaluate WHATEVER is provided in the student booklet. Do not reject it; do your absolute best to find answers or information that can be graded against the marking scheme, even if the material seems unconventional.
    
    EVALUATION RIGOR & FLEXIBILITY:
    - HUMAN-LIKE COGNITION: Evaluate student answers as a fair, empathetic human examiner would. Understand the *intent* and *logic* behind an answer, not just the literals.
    - PERCENTAGE-BASED PARTIAL CREDIT: Allot marks proportionally. If an answer is 50% correct, award 50% marks. Do not use all-or-nothing grading unless specifically required by the question type.
    - CONCEPTUAL & RELATED ANSWERS: Reward "own-word" explanations and conceptually related answers. If a student demonstrates a correct understanding of the underlying principle through synonyms or alternative (but valid) frameworks, award full or near-full marks.
    - STEP-BY-STEP REWARD: In technical or mathematical questions, award marks for every correct step or logical progression even if the final result is incorrect.
    - CONTEXTUAL GRACE: Prioritize the quality of understanding over rote memorization or exact keyword matching from the marking scheme.

    FEEDBACK PROTOCOL:
    - Provide constructive feedback in clear English (even if the answers were in another language).
    - Be specific: "Correctly identified the Boyle's law but missed the constant factor" rather than "Good answer".

    Return the result in STRICT JSON format:
    {
      "totalMarks": number,
      "maxMarks": number,
      "questions": [
        {
          "questionNumber": string,
          "transcription": string (Full transcription of the student's answer),
          "marksAwarded": number,
          "maxMarks": number,
          "feedback": string,
          "pageNumber": number (1-indexed page in student booklet where answer is found),
          "boundingBox": [ymin, xmin, ymax, xmax] // Normalized 0-1000 for the bounding box of the WHOLE answer on that page
        }
      ]
    }
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
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
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === "SAFETY") {
        throw new Error("AI_ERROR_SAFETY: The AI safety filter was triggered.");
      }
      throw new Error("AI_ERROR_EMPTY: The AI returned an empty response. Image might be too blurry.");
    }

    const result = JSON.parse(text);
    const ensureValidNumber = (val: any, fallback: number = 0): number => {
      const num = Number(val);
      return (typeof num === 'number' && !isNaN(num)) ? num : fallback;
    };

    result.totalMarks = ensureValidNumber(result.totalMarks);
    result.maxMarks = ensureValidNumber(result.maxMarks);
    result.questions = (result.questions || []).map((q: any) => ({
      ...q,
      marksAwarded: ensureValidNumber(q.marksAwarded),
      maxMarks: ensureValidNumber(q.maxMarks),
      pageNumber: ensureValidNumber(q.pageNumber, 1),
      boundingBox: Array.isArray(q.boundingBox) ? q.boundingBox.map((b: any) => ensureValidNumber(b)) : undefined
    }));
    
    return result;
  });
};

export const extractStudentDetails = async (
  studentBooklet: { data: string; mimeType: string }
) => {
  // Offline simulation
  if (!navigator.onLine) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      studentName: "Offline Student",
      studentId: "OFF-001",
      otherDetails: {
        branch: "General",
        semester: "1",
        section: "A"
      }
    };
  }

  const ai = getAI();
  const prompt = `
    You are an expert administrative assistant with high-precision handwriting recognition. 
    I am providing you with the first page of a student's exam booklet.
    
    TASK:
    - Analyze the page to extract student identity details.
    - MULTI-LINGUAL SUPPORT: The labels (Name, ID, etc.) can be in any language.
    - HANDWRITING: Read handwritten names and numbers carefully. 
    - IDENTITY FIELDS: Look for Name, USN, Roll No, Branch, Semester, Section, etc.

    Return result in STRICT JSON:
    {
      "studentName": string,
      "studentId": string,
      "otherDetails": {
        "branch": string,
        "semester": string,
        "section": string
      }
    }
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
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
        }
      },
    });

    const text = response.text;
    if (!text) return { studentName: "", studentId: "", otherDetails: {} };
    
    const result = JSON.parse(text);
    return {
      studentName: result.studentName || "",
      studentId: result.studentId || "",
      otherDetails: result.otherDetails || {}
    };
  });
};
