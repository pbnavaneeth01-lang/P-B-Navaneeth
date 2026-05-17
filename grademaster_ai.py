import os
import json
import base64
import time
import google.generativeai as genai
from PIL import Image
import io

# Requirements:
# pip install google-generativeai Pillow

class GradeMasterAI:
    def __init__(self, api_key: str):
        """
        Initialize GradeMaster AI with Gemini API Key.
        """
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-pro')

    def _get_file_data(self, file_path: str):
        """Helper to prepare file for Gemini API"""
        ext = os.path.splitext(file_path)[1].lower()
        mime_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
        
        with open(file_path, "rb") as f:
            data = f.read()
            
        return {
            "mime_type": mime_type,
            "data": data
        }

    def extract_student_details(self, booklet_path: str):
        """
        Recognizes student name and ID from the booklet (Image or PDF).
        """
        print(f"--- Extracting details from: {booklet_path} ---")
        file_data = self._get_file_data(booklet_path)
        
        prompt = """
        You are an expert administrative assistant with high-precision handwriting recognition. 
        Analyze this image of a student exam booklet's front page.
        Extract the student's name, ID, and any other relevant identification details.
        
        Return the result strictly as a JSON object:
        {
          "studentName": "...",
          "studentId": "...",
          "otherDetails": { "branch": "...", "semester": "..." }
        }
        """
        
        response = self.model.generate_content([prompt, img_data])
        try:
            # Simple cleaning of the response to ensure it's valid JSON
            json_str = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(json_str)
        except Exception as e:
            print(f"Error parsing student details: {e}")
            return {"studentName": "Unknown", "studentId": "Unknown"}

    def evaluate_submission(self, qp_path: str, ms_path: str, booklet_path: str):
        """
        Performs the full AI evaluation.
        qp_path: Path to Question Paper
        ms_path: Path to Marking Scheme
        booklet_path: Path to student booklet
        """
        print(f"--- Starting Evaluation for: {booklet_path} ---")
        
        # Prepare all files
        qp_data = self._get_file_data(qp_path)
        ms_data = self._get_file_data(ms_path)
        booklet_data = self._get_file_data(booklet_path)

        prompt = """
        You are an elite academic examiner with multi-lingual expertise and a high precision for handwriting recognition. 
        Your task is to grade a student's answer booklet based on the provided Question Paper and Marking Scheme.

        Instructions:
        1. HUMAN-LIKE COGNITION: Evaluate student answers as a fair human examiner would. Understand the *intent* and *logic* behind an answer, not just literal keyword matching.
        2. PERCENTAGE-BASED PARTIAL CREDIT: Allot marks proportionally based on the accuracy and completeness of the answer. If a student is 60% correct, award 60% of the possible marks.
        3. CONCEPTUAL & RELATED ANSWERS: Reward answers that show understanding through synonyms, paraphrasing, or conceptually related context, even if they don't match the marking scheme exactly.
        4. STEP-BY-STEP REWARD: Award marks for correct logical steps in technical or mathematical problems, even if the final conclusion is flawed.
        5. LINGUISTIC GRACE: Do not penalize for minor spelling or grammatical errors unless it's a language exam.
        6. FEEDBACK: Provide constructive, specific feedback explaining why partial marks were given.

        Return a structured JSON evaluation:
        {
          "totalMarks": 0,
          "maxMarks": 50,
          "summary": "Overall performance analysis...",
          "questions": [
            {
              "questionNumber": "1",
              "transcription": "What the student wrote...",
              "marksAwarded": 8,
              "maxMarks": 10,
              "feedback": "...",
              "pageNumber": 1
            }
          ]
        }
        """

        # Gemini 1.5 Pro can handle multiple files in one request
        content = [
            prompt, 
            "Question Paper:", qp_data, 
            "Marking Scheme:", ms_data, 
            "Student Booklet:", booklet_data
        ]

        response = self.model.generate_content(content)
        
        try:
            json_str = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(json_str)
        except Exception as e:
            print(f"Error parsing evaluation: {e}")
            return {"error": "Failed to parse AI response", "raw": response.text}

if __name__ == "__main__":
    # Example usage
    API_KEY = os.getenv("GEMINI_API_KEY") 
    if not API_KEY:
        print("Please set the GEMINI_API_KEY environment variable.")
        exit(1)

    grader = GradeMasterAI(API_KEY)
    
    # These would normally be the result of a PDF-to-Image conversion step
    # For this demonstration, we assume paths to images exist
    print("GradeMaster AI Python Engine Ready.")
    print("To use: grader.evaluate_submission('qp.jpg', 'ms.jpg', ['page1.jpg', 'page2.jpg'])")
