
import { Exam, Submission } from '../types';

const API_BASE = '/api';

export const api = {
  async getExams(): Promise<Exam[]> {
    const res = await fetch(`${API_BASE}/exams`);
    return res.json();
  },

  async createExam(exam: Partial<Exam>): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...exam,
        id: exam.id || Math.random().toString(36).substr(2, 9)
      }),
    });
    return res.json();
  },

  async getSubmissions(examId: string): Promise<Submission[]> {
    const res = await fetch(`${API_BASE}/submissions/${examId}`);
    return res.json();
  },

  async createSubmission(submission: Partial<Submission>): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...submission,
        id: submission.id || Math.random().toString(36).substr(2, 9)
      }),
    });
    return res.json();
  },

  async updateSubmission(id: string, updates: Partial<Submission>): Promise<void> {
    await fetch(`${API_BASE}/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async updateExam(id: string, updates: Partial<Exam>): Promise<void> {
    await fetch(`${API_BASE}/exams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async deleteSubmission(id: string): Promise<void> {
    await fetch(`${API_BASE}/submissions/${id}`, { method: 'DELETE' });
  },

  async deleteExam(id: string): Promise<void> {
    await fetch(`${API_BASE}/exams/${id}`, { method: 'DELETE' });
  }
};
