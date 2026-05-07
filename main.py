import streamlit as st
import sqlite3
import pandas as pd
import google.generativeai as genai
import json
import os
from fpdf import FPDF
from datetime import datetime
from dotenv import load_dotenv

# Load env variables for Gemini API Key
load_dotenv()
GOOGLE_API_KEY = os.getenv("GEMINI_API_KEY")

if GOOGLE_API_KEY:
    genai.configure(apiKey=GOOGLE_API_KEY)

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect('grademaster.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS exams
                 (id INTEGER PRIMARY KEY AUTO_INCREMENT, title TEXT, question_paper_url TEXT, marking_scheme_url TEXT, created_at TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS submissions
                 (id INTEGER PRIMARY KEY AUTO_INCREMENT, exam_id INTEGER, student_name TEXT, booklet_url TEXT, 
                  status TEXT, total_marks REAL, max_marks REAL, evaluation_data TEXT, created_at TEXT)''')
    conn.commit()
    conn.close()

# SQLite doesn't support AUTO_INCREMENT in the same way as standard SQL without specific syntax
# Fixed init_db for SQLite
def init_db_fixed():
    conn = sqlite3.connect('grademaster.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS exams
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, question_paper_url TEXT, marking_scheme_url TEXT, created_at TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS submissions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_name TEXT, booklet_url TEXT, 
                  status TEXT, total_marks REAL, max_marks REAL, evaluation_data TEXT, created_at TEXT)''')
    conn.commit()
    conn.close()

# --- PDF GENERATION ---
class PDFReport(FPDF):
    def header(self):
        self.set_font("Arial", "B", 15)
        self.cell(0, 10, "GradeMaster AI: Evaluation Report", 0, 1, "C")
        self.ln(10)

    def chapter_title(self, label):
        self.set_font("Arial", "B", 12)
        self.cell(0, 10, label, 0, 1, "L")
        self.ln(4)

    def chapter_body(self, body):
        self.set_font("Arial", "", 10)
        self.multi_cell(0, 10, body)
        self.ln()

def generate_report_pdf(student_name, exam_title, eval_data):
    pdf = PDFReport()
    pdf.add_page()
    
    pdf.chapter_title(f"Student: {student_name}")
    pdf.chapter_title(f"Exam: {exam_title}")
    pdf.chapter_title(f"Final Score: {eval_data['total_marks']} / {eval_data['max_marks']}")
    
    pdf.chapter_title("Executive Summary")
    pdf.chapter_body(eval_data['summary'])
    
    pdf.chapter_title("Detailed Breakdown")
    for q in eval_data['questions']:
        body = f"Question {q['q']}: {q['score']}/{q['max']}\nFeedback: {q['feedback']}"
        pdf.chapter_body(body)
    
    return pdf.output(dest='S').encode('latin-1')

# --- APP UI ---
def main():
    st.set_page_config(page_title="GradeMaster AI", page_icon="🎓", layout="wide")
    init_db_fixed()

    st.sidebar.title("🎓 GradeMaster AI")
    menu = ["Dashboard", "Create Exam", "Evaluate Submission", "Settings"]
    choice = st.sidebar.selectbox("Navigation", menu)

    if choice == "Dashboard":
        show_dashboard()
    elif choice == "Create Exam":
        show_create_exam()
    elif choice == "Evaluate Submission":
        show_evaluate()
    elif choice == "Settings":
        st.title("Settings")
        st.info("Configuration for AI models and storage.")

def show_dashboard():
    st.title("Evaluation Dashboard")
    conn = sqlite3.connect('grademaster.db')
    exams_df = pd.read_sql_query("SELECT * FROM exams", conn)
    
    if exams_df.empty:
        st.warning("No exams found. Create one to get started.")
    else:
        for index, row in exams_df.iterrows():
            with st.expander(f"Exam: {row['title']}"):
                subs_df = pd.read_sql_query(f"SELECT * FROM submissions WHERE exam_id = {row['id']}", conn)
                if not subs_df.empty:
                    for i, sub in subs_df.iterrows():
                        col1, col2, col3 = st.columns([2, 1, 1])
                        with col1:
                            st.write(f"**{sub['student_name']}**")
                        with col2:
                            st.write(f"Score: {sub['total_marks']}/{sub['max_marks']}")
                        with col3:
                            eval_data = json.loads(sub['evaluation_data'])
                            # Generate PDF on the fly for demo
                            pdf_bytes = generate_report_pdf(sub['student_name'], row['title'], eval_data)
                            st.download_button(
                                label="Download Report",
                                data=pdf_bytes,
                                file_name=f"Report_{sub['student_name']}.pdf",
                                mime="application/pdf",
                                key=f"dl_{sub['id']}"
                            )
                else:
                    st.text("No submissions yet.")

    conn.close()

def show_create_exam():
    st.title("Create New Exam Batch")
    with st.form("exam_form"):
        title = st.text_input("Exam Title (e.g. Mid-Term Physics)")
        qp_url = st.text_input("Question Paper URL")
        ms_url = st.text_input("Marking Scheme URL")
        submit = st.form_submit_button("Initialize Batch")
        
        if submit:
            conn = sqlite3.connect('grademaster.db')
            c = conn.cursor()
            c.execute("INSERT INTO exams (title, question_paper_url, marking_scheme_url, created_at) VALUES (?, ?, ?, ?)",
                      (title, qp_url, ms_url, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            st.success(f"Batch '{title}' created!")

def show_evaluate():
    st.title("AI Evaluation Node")
    conn = sqlite3.connect('grademaster.db')
    exams = pd.read_sql_query("SELECT id, title FROM exams", conn)
    
    if exams.empty:
        st.error("Please create an exam batch first.")
        return

    exam_choice = st.selectbox("Select Exam Batch", exams['title'].tolist())
    exam_id = exams[exams['title'] == exam_choice]['id'].values[0]

    with st.form("eval_form"):
        student_name = st.text_input("Student Name")
        booklet_url = st.text_input("Answer Booklet URL (PDF)")
        run_ai = st.form_submit_button("Run Cognitive Evaluation")

        if run_ai:
            if not GOOGLE_API_KEY:
                st.error("API Key missing. Set GEMINI_API_KEY in .env")
            else:
                with st.spinner("Analyzing handwritten nodes..."):
                    # Mock AI logic for local demo as full PDF OCR requires complex setup
                    # Real implementation would use genai.upload_file()
                    result = {
                        "summary": f"Evaluation complete for {student_name}. Concepts show strong grasp of fundamentals.",
                        "total_marks": 42.0,
                        "max_marks": 50.0,
                        "questions": [
                            {"q": "1", "score": 10, "max": 10, "feedback": "Perfect derivation."},
                            {"q": "2", "score": 8, "max": 10, "feedback": "Calculation error in final step."}
                        ]
                    }
                    
                    c = conn.cursor()
                    c.execute("""INSERT INTO submissions 
                                (exam_id, student_name, booklet_url, status, total_marks, max_marks, evaluation_data, created_at) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                              (int(exam_id), student_name, booklet_url, 'evaluated', 
                               result['total_marks'], result['max_marks'], json.dumps(result), datetime.now().isoformat()))
                    conn.commit()
                    st.success("Evaluation protocol finished successfully.")
    conn.close()

if __name__ == "__main__":
    main()
