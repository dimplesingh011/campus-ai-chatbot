import os
import json
import uuid
import urllib.request
import urllib.error
from datetime import datetime
from typing import List, Optional
import fitz  # PyMuPDF
import chromadb
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CampusAI RAG Backend")

# Enable CORS for Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize local persistent ChromaDB
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="college_docs")

# Initialize Groq API Key
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = "openai/gpt-oss-120b"


class ChatRequest(BaseModel):
    query: str
    history: Optional[List[dict]] = []


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        start += chunk_size - overlap
    return [c for c in chunks if len(c) > 20]


def seed_mock_data():
    """Pre-loads sample college rules on first run so the app works immediately."""
    if collection.count() > 0:
        return

    mock_docs = [
        {
            "filename": "Academic_Calendar_2026.pdf",
            "category": "Exams",
            "page": 4,
            "upload_date": "2026-08-10",
            "total_pages": 12,
            "text": (
                "End-Semester Theory Examinations for Odd Semester 2026 will commence on November 24, 2026, "
                "and conclude on December 12, 2026. Hall tickets must be downloaded from the student ERP portal "
                "at least 5 days prior. Electronic devices, smartwatches, and programmable calculators are strictly "
                "prohibited inside examination halls."
            ),
        },
        {
            "filename": "Attendance_Ordinance_2026.pdf",
            "category": "General",
            "page": 2,
            "upload_date": "2026-07-15",
            "total_pages": 6,
            "text": (
                "Minimum Attendance Criteria: Every student is required to maintain a minimum of 75% attendance "
                "in both theory lectures and laboratory practicals separately to be eligible for End-Semester Exams. "
                "A relaxation of up to 10% (down to 65%) may be granted by the Dean solely on verified medical grounds "
                "accompanied by a government hospital certificate submitted within 7 days of recovery."
            ),
        },
        {
            "filename": "Hostel_Rulebook_2026.pdf",
            "category": "Hostel",
            "page": 9,
            "upload_date": "2026-07-20",
            "total_pages": 18,
            "text": (
                "Hostel Curfew & Gate Pass Rules: The main hostel gate closes at 10:00 PM on weekdays and 10:30 PM on weekends. "
                "Students wishing to leave campus overnight or during weekends must apply for a digital Gate Pass on the "
                "CampusApp at least 24 hours in advance, requiring parent SMS confirmation and Warden approval."
            ),
        },
        {
            "filename": "Accounts_Fee_Circular_09.pdf",
            "category": "General",
            "page": 1,
            "upload_date": "2026-09-01",
            "total_pages": 2,
            "text": (
                "Semester Fee Deadline: The last date to pay the Even Semester tuition and hostel fees without late fine "
                "is January 15, 2027. Payments made between January 16 and January 31 will incur a late fine of ₹100 per day. "
                "Fee receipts must be uploaded to the Accounts Office portal."
            ),
        },
    ]

    ids, documents, metadatas = [], [], []
    for doc in mock_docs:
        ids.append(str(uuid.uuid4()))
        documents.append(doc["text"])
        metadatas.append({
            "filename": doc["filename"],
            "category": doc["category"],
            "page": doc["page"],
            "upload_date": doc["upload_date"],
            "total_pages": doc["total_pages"],
        })

    collection.add(ids=ids, documents=documents, metadatas=metadatas)


def call_groq_llm(system_instruction: str, user_prompt: str) -> str:
    """Calls Groq's OpenAI-compatible Chat Completions API using Python's built-in urllib."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "CampusAI-Backend/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {error_body}")


@app.on_event("startup")
def startup_event():
    seed_mock_data()


@app.get("/api/documents")
def list_documents():
    """Returns a unique list of indexed documents in ChromaDB."""
    results = collection.get(include=["metadatas"])
    docs_map = {}
    for meta in results.get("metadatas", []):
        fname = meta.get("filename")
        if fname and fname not in docs_map:
            docs_map[fname] = {
                "filename": fname,
                "category": meta.get("category", "General"),
                "upload_date": meta.get("upload_date", "2026-01-01"),
                "total_pages": meta.get("total_pages", 1),
            }
    return {"documents": list(docs_map.values())}


@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    category: str = Form("General"),
):
    """Extracts text page-by-page from an uploaded PDF and indexes it into ChromaDB."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    try:
        pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    total_pages = len(pdf_doc)
    upload_date = datetime.now().strftime("%Y-%m-%d")

    ids, documents, metadatas = [], [], []

    for page_num in range(total_pages):
        page_text = pdf_doc[page_num].get_text("text").strip()
        if not page_text:
            continue
        chunks = chunk_text(page_text)
        for chunk in chunks:
            ids.append(str(uuid.uuid4()))
            documents.append(chunk)
            metadatas.append({
                "filename": file.filename,
                "category": category,
                "page": page_num + 1,
                "upload_date": upload_date,
                "total_pages": total_pages,
            })

    if not documents:
        raise HTTPException(
            status_code=400,
            detail="No selectable text found in PDF (it may be a scanned image).",
        )

    # Remove existing entries if re-uploading same filename
    collection.delete(where={"filename": file.filename})
    collection.add(ids=ids, documents=documents, metadatas=metadatas)

    return {
        "message": f"Indexed {len(documents)} chunks from {file.filename}",
        "filename": file.filename,
        "total_pages": total_pages,
        "category": category,
        "upload_date": upload_date,
    }


@app.delete("/api/documents/{filename}")
def delete_document(filename: str):
    """Deletes all chunks belonging to a specific PDF."""
    collection.delete(where={"filename": filename})
    return {"message": f"Deleted {filename} from knowledge base."}


@app.post("/api/chat")
def chat_with_docs(request: ChatRequest):
    """Retrieves relevant chunks from ChromaDB and generates a grounded response."""
    if collection.count() == 0:
        return {
            "answer": "The college knowledge base is currently empty. Please switch to Admin Mode and upload college PDFs first.",
            "citations": [],
            "retrieved_context": [],
        }

    # Retrieve top 4 most relevant chunks
    results = collection.query(
        query_texts=[request.query],
        n_results=min(4, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]
    distances = results["distances"][0]

    context_blocks = []
    citations = []
    retrieved_context = []
    seen_citations = set()

    for doc_text, meta, dist in zip(docs, metas, distances):
        fname = meta.get("filename", "Unknown.pdf")
        page = meta.get("page", 1)
        citation_key = f"{fname} — Page {page}"

        context_blocks.append(f"[{citation_key}]\n{doc_text}")
        retrieved_context.append({
            "source": citation_key,
            "text": doc_text,
            "relevance_score": round(max(0, 1 - dist), 2),
        })

        if citation_key not in seen_citations:
            seen_citations.add(citation_key)
            citations.append({
                "filename": fname,
                "page": page,
                "label": citation_key,
            })

    combined_context = "\n\n---\n\n".join(context_blocks)

    system_instruction = (
        "You are CampusAI, an official college assistant chatbot. "
        "Answer the student's question STRICTLY using ONLY the provided college document excerpts below. "
        "Rules:\n"
        "1. Do NOT use outside knowledge or make assumptions.\n"
        "2. If the answer is not explicitly contained in the context, reply: "
        "'I could not find information about that in the uploaded college documents. Please check with the college administrative office or upload the relevant circular.'\n"
        "3. Keep your answer clear, structured with bullet points if needed, and helpful for students."
    )

    prompt = f"CONTEXT FROM COLLEGE DOCUMENTS:\n{combined_context}\n\nSTUDENT QUESTION:\n{request.query}"

    # Generate response using Groq API
    if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
        try:
            answer_text = call_groq_llm(system_instruction, prompt)
        except Exception as e:
            answer_text = f"⚠️ Groq API Error: {str(e)}\n\n**Top Retrieved Excerpt:**\n{docs[0]}"
    else:
        answer_text = (
            "⚠️ *Running in Local Demo Mode (No `GROQ_API_KEY` detected).*\n\n"
            f"Based on **{citations[0]['label']}**, here is the relevant college rule:\n\n> {docs[0]}"
        )

    return {
        "answer": answer_text,
        "citations": citations,
        "retrieved_context": retrieved_context,
    }