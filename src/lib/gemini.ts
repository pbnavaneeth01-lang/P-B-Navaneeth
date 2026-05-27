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

  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch("/api/gemini/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionPaper, markingScheme, studentBooklet }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
        throw new Error(errorData.error || `Evaluation failed with status ${response.status}`);
      }

      const result = await response.json();

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
    } catch (error: any) {
      attempt++;
      if (attempt > maxRetries || !error.message?.includes("Failed to fetch")) {
        console.error(`Evaluation failed after ${attempt} attempts:`, error);
        throw new Error(error.message?.includes("Failed to fetch") 
          ? "Network error: Connection to evaluation server failed. Please check your internet or retry." 
          : error.message);
      }
      console.warn(`Fetch failed, retrying (${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  throw new Error("Evaluation failed after multiple connection attempts.");
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

  const response = await fetch("/api/gemini/extract-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentBooklet }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Extraction failed on server");
  }

  const result = await response.json();
  return {
    studentName: result.studentName || "",
    studentId: result.studentId || "",
    otherDetails: result.otherDetails || {}
  };
};
