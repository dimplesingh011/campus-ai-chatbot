# CampusAI — Smart College Assistant (RAG Chatbot)

A full-stack Retrieval-Augmented Generation (RAG) web portal built for college assignments. Students can query college notices, exam schedules, hostel rules, and syllabi and receive strictly grounded answers with exact PDF page citations.

## Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **VS Code**
- Free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

---

## Step 1: Start the Backend (Terminal 1 in VS Code)

1. Open the `campus-ai` folder in VS Code and open a terminal (`Ctrl + ~`).
2. Navigate to `backend`, create a virtual environment, and install dependencies:
   ```bash
   cd backend
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate

   pip install -r requirements.txt