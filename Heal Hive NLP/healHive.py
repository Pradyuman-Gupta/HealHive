from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint, HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser, PydanticOutputParser
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS

from pydantic import BaseModel
from typing import List, Optional
import json
from dotenv import load_dotenv

load_dotenv()



llm_classifier = HuggingFaceEndpoint(
    repo_id="openai/gpt-oss-safeguard-20b",
    task="text-generation"
)

llm_research = HuggingFaceEndpoint(
    repo_id="Qwen/Qwen3-8B",
    task="text-generation",
    max_new_tokens=800,
    temperature=0.1
)

classifierModel = ChatHuggingFace(llm=llm_classifier)
researchModel = ChatHuggingFace(llm=llm_research)

strParser = StrOutputParser()


query_classifier_prompt = PromptTemplate(
    template="""
Reply ONLY with YES if the query is about health or medicine.
Reply ONLY with NO otherwise.

Query: {query}
""",
    input_variables=["query"]
)

keyword_prompt = PromptTemplate(
    template="""
Extract important medical keywords from the query.

Return ONLY a JSON array.

Query:
{query}
""",
    input_variables=["query"]
)



class SentimentAnalysis(BaseModel):
    positive_experiences: Optional[str] = None
    negative_experiences: Optional[str] = None


class MedicalReport(BaseModel):

    query_summary: Optional[str] = None
    treatment_overview: Optional[str] = None
    common_side_effects: Optional[List[str]] = None
    recovery_timeline: Optional[str] = None
    sentiment_analysis: Optional[SentimentAnalysis] = None
    credibility_score: Optional[int] = None
    source_references: Optional[List[str]] = None



def extract_keywords(query: str):

    try:

        classifier = classifierModel.invoke(
            query_classifier_prompt.format(query=query)
        )

        verdict = classifier.content.strip()

        if verdict != "YES":
            return []

        keyword_result = classifierModel.invoke(
            keyword_prompt.format(query=query)
        )

        parsed = strParser.parse(keyword_result.content)

        keywords = json.loads(parsed)

        return keywords

    except Exception:
        return []



def analyze_papers(query: str, papers_json: dict):

    papers = papers_json.get("results", [])

    if not papers:
        return {
            "query_summary": "No research data available",
            "treatment_overview": None,
            "common_side_effects": None,
            "recovery_timeline": None,
            "sentiment_analysis": None,
            "credibility_score": 0,
            "source_references": []
        }

    documents = []

    for item in papers:

        text = f"{item.get('title','')}\n\n{item.get('summary','')}"

        doc = Document(
            page_content=text,
            metadata={
                "url": item.get("url"),
                "source": item.get("source")
            }
        )

        documents.append(doc)

    # remove duplicates
    seen = set()
    unique_docs = []

    for doc in documents:

        content = doc.page_content.lower()

        if content not in seen:
            seen.add(content)
            unique_docs.append(doc)

    documents = unique_docs

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=100
    )

    chunks = splitter.split_documents(documents)

    embedding_model = HuggingFaceEmbeddings(
        model_name="BAAI/bge-large-en",
        encode_kwargs={"normalize_embeddings": True}
    )

    vector_db = FAISS.from_documents(chunks, embedding_model)

    retriever = vector_db.as_retriever(search_kwargs={"k": 5})

    results = retriever.invoke(query)

    context = "\n\n".join([doc.page_content for doc in results])

    sources = list(set([
        doc.metadata.get("url")
        for doc in results
        if doc.metadata.get("url")
    ]))

    parser = PydanticOutputParser(pydantic_object=MedicalReport)

    analysis_prompt = PromptTemplate(
        template="""
Generate a structured medical report.

Query:
{query}

Context:
{context}

{format_instructions}

Return ONLY JSON.
""",
        input_variables=["query","context"],
        partial_variables={
            "format_instructions": parser.get_format_instructions()
        }
    )

    response = researchModel.invoke(
        analysis_prompt.format(
            query=query,
            context=context
        )
    )

    text = response.content

    if "<think>" in text:
        text = text.split("</think>")[-1]

    output = parser.parse(text)

    output.source_references = sources

    return output.model_dump()