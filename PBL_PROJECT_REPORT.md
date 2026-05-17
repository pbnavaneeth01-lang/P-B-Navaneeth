# Project Report: GradeMaster AI
## Interdisciplinary Project-Based Learning (PBL)

### 1. Project Overview
GradeMaster AI is a smart grading assistant designed to help educators evaluate student scripts using Artificial Intelligence. It bridges the gap between traditional paper-based exams and digital precision.

### 2. Interdisciplinary Connections

#### A. Computer Science & Artificial Intelligence
- **Implementation**: Built using **Python** (Flask) and **Gemini 1.5 Pro**.
- **Key Concept**: Integrating AI via API calls to perform complex tasks like OCR (Optical Character Recognition) and semantic analysis.

#### B. Mathematics & Logic
- **Implementation**: The system calculates weighted scores based on a predefined Marking Scheme.
- **Key Concept**: Logic-based validation ensuring that the sum of parts equals the total marks awarded.

#### C. Language & Linguistics
- **Implementation**: Uses AI to transcribe diverse handwriting styles into digital text.
- **Key Concept**: Semantic understanding—where the AI evaluates the *meaning* of an answer, not just keywords.

#### D. Social Impact & Education
- **Implementation**: Designed to reduce teacher burnout and provide instant, high-quality feedback to students.
- **Key Concept**: Technology as a tool for social and educational equity.

### 3. Technical Setup (How to Run)
1. Install Python 3.
2. Install dependencies: `pip install -r requirements.txt`
3. Set your API Key: `export GEMINI_API_KEY='your_key_here'`
4. Run the app: `python grademaster_app.py`
5. Access via: `http://localhost:5000`
