from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from healHive import extract_keywords, analyze_papers

app = FastAPI(title="HealHive NLP Server")

# ── CORS — allow the Node.js backend to call this server ─────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


class PaperRequest(BaseModel):
    query: str
    papers: dict


@app.get("/")
def health():
    return {"status": "HealHive AI server running"}


@app.post("/extract-keywords")
def get_keywords(data: QueryRequest):
    keywords = extract_keywords(data.query)
    return {"keywords": keywords}


@app.post("/analyze-papers")
def analyze(data: PaperRequest):
    result = analyze_papers(data.query, data.papers)
    return result