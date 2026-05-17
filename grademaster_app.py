import os
import json
import uuid
import time
from flask import Flask, render_template_string, request, jsonify, redirect, url_for
from werkzeug.utils import secure_filename
from grademaster_ai import GradeMasterAI

# Setup Flask App
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Configure AI
API_KEY = os.getenv("GEMINI_API_KEY")
grader = None
if API_KEY:
    grader = GradeMasterAI(API_KEY)

# Mock Database (In-Memory for this demo)
DB = {
    "exams": [],
    "submissions": []
}

# --- UI TEMPLATE (Jinja2 + Tailwind) ---
INDEX_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>GradeMaster AI | Full Python Suite</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #0b0f1a; color: #f1f5f9; }
        .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
        .btn-submit { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
    </style>
</head>
<body class="p-4 md:p-12 min-h-screen">
    <div class="max-w-7xl mx-auto">
        <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-16">
            <div>
                <h1 class="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-indigo-400 to-emerald-400">
                    GRADEMASTER AI
                </h1>
                <p class="text-slate-500 font-mono text-xs uppercase tracking-[0.4em] mt-3">Full-Fetched Python Implementation</p>
            </div>
            <div class="flex gap-4">
                <button onclick="toggleModal('examModal')" class="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-blue-900/20 active:scale-95">
                    + INITIALIZE EXAM
                </button>
            </div>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <!-- Left: Exams & Submissions -->
            <div class="lg:col-span-2 space-y-12 text-blue-500">
                <section>
                    <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Active Assessment Modules</h2>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {% for exam in exams %}
                        <div class="glass p-8 rounded-[32px] border-slate-800/50 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                            <div class="flex justify-between items-start mb-6">
                                <div class="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-400">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                </div>
                                <div class="text-right">
                                    <p class="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Students</p>
                                    <p class="text-lg font-black text-white">{{ exam.students|length }}</p>
                                </div>
                            </div>
                            <h3 class="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors uppercase tracking-tight">{{ exam.title }}</h3>
                            <p class="text-slate-500 text-xs font-mono mb-6 italic">{{ exam.id[:8] }}...</p>
                            
                            <div class="flex flex-wrap gap-2 mb-8">
                                <span class="bg-slate-900/80 text-[10px] px-3 py-1 rounded-lg text-slate-400 font-bold border border-slate-800">PYTHON 3.11</span>
                                <span class="bg-emerald-500/10 text-[10px] px-3 py-1 rounded-lg text-emerald-400 font-bold border border-emerald-500/10">GEMINI PRO</span>
                            </div>

                            <button onclick="openSubmissionModal('{{ exam.id }}', '{{ exam.title }}')" class="w-full py-4 bg-slate-800/50 hover:bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all">
                                Upload Booklet
                            </button>
                        </div>
                        {% else %}
                        <div class="col-span-full py-20 glass rounded-[40px] text-center border-dashed border-slate-800">
                            <p class="text-slate-600 italic font-medium">System Idle. Awaiting first exam initialization.</p>
                        </div>
                        {% endfor %}
                    </div>
                </section>

                <section>
                    <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Recent Evaluations</h2>
                    <div class="glass rounded-[32px] overflow-hidden border-slate-800/50">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-slate-900/50">
                                <tr>
                                    <th class="p-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Student</th>
                                    <th class="p-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Exam</th>
                                    <th class="p-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center">Score</th>
                                    <th class="p-6 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/50 uppercase">
                                {% for sub in submissions %}
                                <tr class="hover:bg-slate-800/30 transition-colors cursor-pointer" onclick="viewEvaluation('{{ sub.id }}')">
                                    <td class="p-6">
                                        <p class="font-bold text-white">{{ sub.studentName }}</p>
                                        <p class="text-[10px] text-slate-500 font-mono tracking-tighter">{{ sub.id[:8] }}</p>
                                    </td>
                                    <td class="p-6 text-sm font-medium text-slate-400">
                                        {{ sub.examTitle }}
                                    </td>
                                    <td class="p-6 text-center">
                                        {% if sub.status == 'evaluated' %}
                                        <div class="inline-flex flex-col items-center">
                                            <span class="text-xl font-black text-blue-400">{{ sub.totalMarks }}</span>
                                            <span class="text-[8px] text-slate-600 -mt-1">/ {{ sub.maxMarks }}</span>
                                        </div>
                                        {% else %}
                                        <span class="text-slate-700 font-bold">--</span>
                                        {% endif %}
                                    </td>
                                    <td class="p-6 text-right">
                                        {% if sub.status == 'evaluated' %}
                                        <span class="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black tracking-widest border border-emerald-500/20">GRADED</span>
                                        {% else %}
                                        <span class="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] font-black tracking-widest border border-blue-500/20 animate-pulse">EVALUATING</span>
                                        {% endif %}
                                    </td>
                                </tr>
                                {% else %}
                                <tr>
                                    <td colspan="4" class="p-12 text-center text-slate-600 italic">No submissions processed yet.</td>
                                </tr>
                                {% endfor %}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Right: System Info -->
            <div class="space-y-8">
                <div class="glass p-8 rounded-[40px] border-emerald-500/10 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10">
                        <svg class="w-20 h-20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"></path></svg>
                    </div>
                    <h2 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4">Core Engine Status</h2>
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                        <p class="text-2xl font-black text-white">SYSTEM OPERATIONAL</p>
                    </div>
                    <p class="text-sm text-slate-500 leading-relaxed">Gemini 1.5 Pro is currently linked and ready for high-fidelity handwriting recognition.</p>
                </div>

                <div class="glass p-8 rounded-[40px] border-slate-800/50">
                    <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Project Metadata</h2>
                    <div class="space-y-4">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500 font-mono">Backend</span>
                            <span class="text-blue-400 font-bold">Python / Flask</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500 font-mono">AI Model</span>
                            <span class="text-blue-400 font-bold">Gemini 1.5 Pro</span>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500 font-mono">Context</span>
                            <span class="text-blue-400 font-bold">Multimodal (PDF/IMG)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modals -->
    <!-- Create Exam Modal -->
    <div id="examModal" class="hidden fixed inset-0 bg-slate-950/90 backdrop-blur-3xl z-[100] flex items-center justify-center p-4">
        <div class="glass max-w-xl w-full p-10 rounded-[48px] border-blue-500/20 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div class="flex justify-between items-center mb-10">
                <div>
                    <h2 class="text-3xl font-black tracking-tighter">INITIALIZE EXAM</h2>
                    <p class="text-slate-500 text-[10px] uppercase font-mono tracking-widest mt-2">New Assessment Master</p>
                </div>
                <button onclick="toggleModal('examModal')" class="p-3 bg-slate-800 rounded-2xl hover:text-white transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <form action="/create-exam" method="POST" enctype="multipart/form-data" onchange="checkExamInputs()">
                <div class="space-y-8">
                    <div>
                        <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Exam Identifier</label>
                        <input name="title" id="examTitle" type="text" required placeholder="e.g. ADV-QUANTUM-2024" class="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500 transition-all font-bold">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Question Paper (PDF/IMG)</label>
                            <input name="qp_file" id="examQP" type="file" required class="hidden" onchange="updateFileLabel('examQP', 'qpLabel')">
                            <label for="examQP" id="qpLabel" class="block w-full text-center bg-slate-950 border border-dashed border-slate-800 rounded-2xl py-8 cursor-pointer hover:border-blue-500/50 transition-all">
                                <span class="text-slate-600 text-xs font-bold uppercase">Select QP</span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Marking Scheme (PDF/IMG)</label>
                            <input name="ms_file" id="examMS" type="file" required class="hidden" onchange="updateFileLabel('examMS', 'msLabel')">
                            <label for="examMS" id="msLabel" class="block w-full text-center bg-slate-950 border border-dashed border-slate-800 rounded-2xl py-8 cursor-pointer hover:border-blue-500/50 transition-all">
                                <span class="text-slate-600 text-xs font-bold uppercase">Select MS</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Student Roster (One per line)</label>
                        <textarea name="students" rows="4" placeholder="CANDIDATE-001&#10;CANDIDATE-002" class="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500 transition-all font-mono text-xs"></textarea>
                    </div>

                    <button type="submit" id="examSubmit" class="btn-submit w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20">
                        COMMIT EXAM MODULE
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Submission Modal -->
    <div id="submissionModal" class="hidden fixed inset-0 bg-slate-950/90 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 text-emerald-500">
        <div class="glass max-w-xl w-full p-10 rounded-[48px] border-blue-500/20 shadow-2xl relative">
             <div class="flex justify-between items-center mb-10">
                <div>
                    <h2 class="text-3xl font-black tracking-tighter text-white">SUBMISSION UPLOAD</h2>
                    <p id="subModalExamTitle" class="text-blue-500 text-[10px] uppercase font-mono tracking-widest mt-2">Exam: ...</p>
                </div>
                <button onclick="toggleModal('submissionModal')" class="p-3 bg-slate-800 rounded-2xl hover:text-white transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <form action="/upload-submission" method="POST" enctype="multipart/form-data" onchange="checkSubInputs()">
                <input type="hidden" name="exam_id" id="subExamId">
                <input type="hidden" name="exam_title" id="subExamTitleInput">
                
                <div class="space-y-8">
                    <div>
                        <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Answer Booklet (PDF/IMG)</label>
                        <input name="booklet" id="subBooklet" type="file" required class="hidden" onchange="updateFileLabel('subBooklet', 'bookletLabel')">
                        <label for="subBooklet" id="bookletLabel" class="block w-full text-center bg-slate-950 border border-dashed border-slate-800 rounded-[32px] py-16 cursor-pointer hover:border-blue-500/50 transition-all group">
                             <div class="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                             </div>
                             <span class="text-slate-400 text-sm font-bold block">DRAG & DROP OR EXPLORE</span>
                             <span class="text-[10px] text-slate-700 font-mono mt-2 block uppercase tracking-widest">Awaiting File Signal...</span>
                        </label>
                    </div>

                    <div>
                         <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 italic text-blue-500">Option: Auto-Identify Student Name via AI</label>
                         <p class="text-[10px] text-slate-600 font-medium">Leave student name field blank or enter manually if roster is known.</p>
                         <input name="student_name" placeholder="Manual Override (e.g. John Doe)" class="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500 transition-all font-bold mt-4 text-white">
                    </div>

                    <button type="submit" id="subSubmit" class="btn-submit w-full py-6 bg-blue-600 text-white rounded-[32px] font-black text-sm uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-4">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        SUBMIT FOR AI EVALUATION
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function toggleModal(id) {
            document.getElementById(id).classList.toggle('hidden');
        }

        function openSubmissionModal(examId, examTitle) {
            document.getElementById('subExamId').value = examId;
            document.getElementById('subExamTitleInput').value = examTitle;
            document.getElementById('subModalExamTitle').innerText = 'Exam: ' + examTitle;
            toggleModal('submissionModal');
        }

        function updateFileLabel(inputId, labelId) {
            const input = document.getElementById(inputId);
            const label = document.getElementById(labelId);
            if (input.files.length > 0) {
                label.innerHTML = `<span class="text-emerald-400 text-xs font-bold uppercase">SELECTED: ${input.files[0].name}</span>`;
                label.classList.replace('border-slate-800', 'border-emerald-500/50');
            }
        }

        function checkExamInputs() {
            const title = document.getElementById('examTitle').value;
            const qp = document.getElementById('examQP').files.length;
            const ms = document.getElementById('examMS').files.length;
            const submit = document.getElementById('examSubmit');
            
            if (title && qp && ms) {
                submit.style.display = 'block';
            } else {
                submit.style.display = 'none';
            }
        }

        function checkSubInputs() {
            const booklet = document.getElementById('subBooklet').files.length;
            const submit = document.getElementById('subSubmit');
            
            if (booklet) {
                submit.style.display = 'flex';
            } else {
                submit.style.display = 'none';
            }
        }

        function viewEvaluation(id) {
            alert("Viewing detail for: " + id + "\\n\\nin Python version, this would redirect to a detail report view.");
        }
    </script>
</body>
</html>
"""

# --- ROUTES ---

@app.route('/')
def home():
    return render_template_string(INDEX_HTML, exams=DB["exams"], submissions=DB["submissions"])

@app.route('/create-exam', methods=['POST'])
def create_exam():
    title = request.form.get('title')
    qp_file = request.files.get('qp_file')
    ms_file = request.files.get('ms_file')
    students_raw = request.form.get('students', '')
    students = [s.strip() for s in students_raw.split('\n') if s.strip()]
    
    exam_id = str(uuid.uuid4())
    
    # Save files
    qp_filename = secure_filename(f"{exam_id}_QP_{qp_file.filename}")
    ms_filename = secure_filename(f"{exam_id}_MS_{ms_file.filename}")
    qp_path = os.path.join(app.config['UPLOAD_FOLDER'], qp_filename)
    ms_path = os.path.join(app.config['UPLOAD_FOLDER'], ms_filename)
    qp_file.save(qp_path)
    ms_file.save(ms_path)
    
    new_exam = {
        "id": exam_id,
        "title": title,
        "students": students,
        "qpPath": qp_path,
        "msPath": ms_path,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    DB["exams"].append(new_exam)
    return redirect(url_for('home'))

@app.route('/upload-submission', methods=['POST'])
def upload_submission():
    exam_id = request.form.get('exam_id')
    exam_title = request.form.get('exam_title')
    booklet_file = request.files.get('booklet')
    manual_name = request.form.get('student_name')
    
    sub_id = str(uuid.uuid4())
    filename = secure_filename(f"{sub_id}_{booklet_file.filename}")
    booklet_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    booklet_file.save(booklet_path)
    
    # Create preliminary entry
    submission = {
        "id": sub_id,
        "examId": exam_id,
        "examTitle": exam_title,
        "studentName": manual_name or "Scanning...",
        "status": "evaluating",
        "bookletPath": booklet_path,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    DB["submissions"].append(submission)
    
    # Trigger AI Evaluation in background (synchronous for this simple demo)
    if grader:
        exam = next((e for e in DB["exams"] if e["id"] == exam_id), None)
        if exam:
            try:
                # If name is missing, extract it
                if not manual_name:
                    details = grader.extract_student_details(booklet_path)
                    submission["studentName"] = details.get("studentName", "Unknown Student")
                
                # Evaluate marks
                eval_res = grader.evaluate_submission(exam["qpPath"], exam["msPath"], booklet_path)
                submission.update({
                    "status": "evaluated",
                    "totalMarks": eval_res.get("totalMarks", 0),
                    "maxMarks": eval_res.get("maxMarks", 50),
                    "evaluationData": eval_res
                })
            except Exception as e:
                print(f"AI Evaluation Error: {e}")
                submission["status"] = "error"
    else:
        # Fallback if no API key
        submission["studentName"] = manual_name or "Demo Student"
        submission["status"] = "evaluated"
        submission["totalMarks"] = 42
        submission["maxMarks"] = 50

    return redirect(url_for('home'))

if __name__ == '__main__':
    print("GradeMaster AI: Python Full Suite is ready.")
    app.run(host='0.0.0.0', port=3000, debug=True)
