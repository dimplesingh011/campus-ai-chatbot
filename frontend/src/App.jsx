
import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  Send,
  FileText,
  UploadCloud,
  Trash2,
  ShieldCheck,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
const API_BASE = import.meta.env.VITE_API_URL || '';

const QUICK_PROMPTS = [
  'Exam timetable & rules',
  'Minimum attendance criteria',
  'Hostel curfew & gate pass',
  'Semester fee deadline',
];

const INITIAL_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm **CampusAI**, your official college assistant. Ask me anything about exam schedules, attendance ordinances, hostel rules, or fee deadlines—I'll answer strictly from indexed college circulars with exact page citations.",
  citations: [],
  retrieved_context: [],
};

export default function App() {
  const [mode, setMode] = useState('student'); // 'student' | 'admin'
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedContexts, setExpandedContexts] = useState({});

  // Admin State
  const [documents, setDocuments] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Exams');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend ?? input).trim();
    if (!query || isLoading) return;

    const userMsg = { id: Date.now().toString(), role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        citations: data.citations || [],
        retrieved_context: data.retrieved_context || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            '⚠️ Unable to reach the FastAPI backend. Please make sure `uvicorn main:app --reload` is running on port 8000.',
          citations: [],
          retrieved_context: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadStatus({ type: 'error', text: 'Please upload a valid PDF file.' });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Upload failed');
      }

      setUploadStatus({ type: 'success', text: data.message });
      fetchDocuments();
    } catch (err) {
      setUploadStatus({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (filename) => {
    try {
      await fetch(`/api/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      fetchDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const toggleContext = (msgId) => {
    setExpandedContexts((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-none">
                CampusAI
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Smart College RAG Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Switcher */}
            <div className="bg-slate-800 p-1 rounded-lg flex items-center border border-slate-700">
              <button
                onClick={() => setMode('student')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  mode === 'student'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Student Mode
              </button>
              <button
                onClick={() => setMode('admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  mode === 'admin'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin Knowledge Base
                <span className="ml-1 bg-slate-700 text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {documents.length}
                </span>
              </button>
            </div>

            {mode === 'student' && (
              <button
                onClick={() => setMessages([INITIAL_MESSAGE])}
                title="Clear Chat"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 flex flex-col">
        {mode === 'student' ? (
          /* ================= STUDENT CHAT VIEW ================= */
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-h-[calc(100vh-270px)]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white rounded-br-sm'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Citations & Retrieved Context Accordion */}
                    {msg.role === 'assistant' && msg.citations?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cit, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/70"
                            >
                              <FileText className="w-3 h-3" />
                              {cit.label}
                            </span>
                          ))}
                        </div>

                        {msg.retrieved_context?.length > 0 && (
                          <div>
                            <button
                              onClick={() => toggleContext(msg.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition mt-1"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              {expandedContexts[msg.id]
                                ? 'Hide Retrieved Context'
                                : 'View Retrieved Context'}
                              {expandedContexts[msg.id] ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {expandedContexts[msg.id] && (
                              <div className="mt-2 space-y-2">
                                {msg.retrieved_context.map((ctx, i) => (
                                  <div
                                    key={i}
                                    className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600"
                                  >
                                    <div className="flex justify-between font-semibold text-slate-700 mb-1">
                                      <span>{ctx.source}</span>
                                      <span className="text-indigo-600">
                                        Match: {Math.round(ctx.relevance_score * 100)}%
                                      </span>
                                    </div>
                                    <p className="italic">"{ctx.text}"</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 items-center text-slate-500 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                  </div>
                  <span>Searching college documents & generating cited answer...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Bottom Input & Quick Prompts */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              {/* Quick-Prompt Chips */}
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSendMessage(chip)}
                    disabled={isLoading}
                    className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50/50 transition shadow-2xs disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about exam schedules, attendance rules, hostel gate pass, fees..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                >
                  <span>Ask</span>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ================= ADMIN KNOWLEDGE BASE VIEW ================= */
          <div className="space-y-6">
            {/* Upload Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Upload College Circulars & Syllabi
                  </h2>
                  <p className="text-sm text-slate-500">
                    PDFs are chunked and embedded locally into ChromaDB for instant student Q&A.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">
                    Category Tag:
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Exams">Exams</option>
                    <option value="Syllabus">Syllabus</option>
                    <option value="Hostel">Hostel</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                />
                <UploadCloud className="w-10 h-10 text-indigo-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-800">
                  {isUploading
                    ? 'Extracting text & indexing vectors...'
                    : 'Click to browse or drag & drop a PDF file here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports official PDF circulars, timetables, and handbooks
                </p>
              </div>

              {uploadStatus && (
                <div
                  className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                    uploadStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {uploadStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{uploadStatus.text}</span>
                </div>
              )}
            </div>

            {/* Indexed Documents Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">
                  Indexed Knowledge Base ({documents.length} Documents)
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Document Name</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3">Pages</th>
                      <th className="px-6 py-3">Upload Date</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {documents.length === 0 ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-6 py-8 text-center text-slate-500"
                        >
                          No documents indexed yet. Upload a PDF above to get started.
                        </td>
                      </tr>
                    ) : (
                      documents.map((doc) => (
                        <tr key={doc.filename} className="hover:bg-slate-50">
                          <td className="px-6 py-3.5 font-medium text-slate-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            {doc.filename}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {doc.category}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-slate-600">
                            {doc.total_pages}
                          </td>
                          <td className="px-6 py-3.5 text-slate-600">
                            {doc.upload_date}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => handleDeleteDocument(doc.filename)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Remove from Vector DB"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        CampusAI — Retrieval-Augmented Generation (RAG) College Portal • Powered by FastAPI, ChromaDB & Gemini
      </footer>
    </div>
  );
}
