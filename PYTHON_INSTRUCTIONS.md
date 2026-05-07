# How to Run GradeMaster Python on Your PC

Follow these steps to set up and run the application locally on your computer.

### 1. Prerequisites
Ensure you have **Python 3.9** or higher installed. You can check your version by running:
```bash
python --version
```

### 2. Setup the Environment
Clone or move the files (`main.py`, `requirements.txt`) into a new folder on your PC.

1. **Open your terminal/command prompt** in that folder.
2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   ```
3. **Activate the virtual environment**:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`

### 3. Install Dependencies
Run the following command to install all required libraries:
```bash
pip install -r requirements.txt
```

### 4. Configure API Key
The AI features require a Google Gemini API Key.
1. Create a file named `.env` in the same folder.
2. Add your key inside the file like this:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

### 5. Run the Application
Launch GradeMaster by running:
```bash
streamlit run main.py
```

Streamlit will provide a local URL (usually `http://localhost:8501`) which you can open in any web browser.

---

### Features inside the Python Version:
- **Local SQLite DB**: All your data is stored in a file named `grademaster.db` on your computer. No cloud setup required.
- **Dashboard**: Track student performance across multiple exam batches.
- **AI-Powered Evaluation**: Uses the Gemini Python SDK to analyze student submissions.
- **Portable**: You can copy the folder to any PC and it will work with just Python installed.
