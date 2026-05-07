
import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import cors from 'cors';

const db = new Database('grademaster.db');

// Initialize SQLite Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT,
    questionPaperUrl TEXT,
    markingSchemeUrl TEXT,
    studentList TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    examId TEXT,
    studentName TEXT,
    bookletUrl TEXT,
    status TEXT,
    totalMarks REAL,
    maxMarks REAL,
    evaluationData TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(examId) REFERENCES exams(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  const PORT = 3000;

  // --- API ROUTES ---

  // Exams
  app.get('/api/exams', (req, res) => {
    const exams = db.prepare('SELECT * FROM exams ORDER BY createdAt DESC').all();
    const results = exams.map((e: any) => ({
      ...e,
      studentList: e.studentList ? JSON.parse(e.studentList) : []
    }));
    res.json(results);
  });

  app.post('/api/exams', (req, res) => {
    const { id, title, questionPaperUrl, markingSchemeUrl } = req.body;
    const stmt = db.prepare('INSERT INTO exams (id, title, questionPaperUrl, marking_scheme_url) VALUES (?, ?, ?, ?)');
    // Fixed column name in query to match schema exactly: questionPaperUrl vs question_paper_url
    const insert = db.prepare('INSERT INTO exams (id, title, questionPaperUrl, markingSchemeUrl) VALUES (?, ?, ?, ?)');
    insert.run(id, title, questionPaperUrl, markingSchemeUrl);
    res.status(201).json({ id });
  });

  // Submissions
  app.get('/api/submissions/:examId', (req, res) => {
    const submissions = db.prepare('SELECT * FROM submissions WHERE examId = ? ORDER BY createdAt DESC').all(req.params.examId);
    // Parse JSON string back to object
    const results = submissions.map((s: any) => ({
      ...s,
      evaluationData: s.evaluationData ? JSON.parse(s.evaluationData) : null
    }));
    res.json(results);
  });

  app.post('/api/submissions', (req, res) => {
    const { id, examId, studentName, bookletUrl, status, totalMarks, maxMarks, evaluationData } = req.body;
    const stmt = db.prepare(`
      INSERT INTO submissions (id, examId, studentName, bookletUrl, status, totalMarks, maxMarks, evaluationData) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, examId, studentName, bookletUrl, status, totalMarks, maxMarks, JSON.stringify(evaluationData));
    res.status(201).json({ id });
  });

  app.delete('/api/submissions/:id', (req, res) => {
    db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  app.delete('/api/exams/:id', (req, res) => {
    const deleteSubmissions = db.prepare('DELETE FROM submissions WHERE examId = ?');
    const deleteExam = db.prepare('DELETE FROM exams WHERE id = ?');
    
    // Run in transaction
    const transaction = db.transaction(() => {
      deleteSubmissions.run(req.params.id);
      deleteExam.run(req.params.id);
    });
    transaction();
    res.status(204).send();
  });

  app.patch('/api/exams/:id', (req, res) => {
    const { title, studentList } = req.body;
    if (studentList) {
      db.prepare('UPDATE exams SET studentList = ? WHERE id = ?').run(JSON.stringify(studentList), req.params.id);
    }
    if (title) {
       db.prepare('UPDATE exams SET title = ? WHERE id = ?').run(title, req.params.id);
    }
    res.status(200).send();
  });

  app.patch('/api/submissions/:id', (req, res) => {
    const updates = req.body;
    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => typeof updates[f] === 'object' ? JSON.stringify(updates[f]) : updates[f]);
    
    db.prepare(`UPDATE submissions SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
    res.status(200).send();
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
