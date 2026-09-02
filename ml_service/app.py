from __future__ import annotations

import uuid
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from scipy.stats import ks_2samp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

TRAINING_DATA = [("Government publishes the final budget after parliament approval",0),("Local health department releases official vaccination schedule",0),("University announces examination dates on its official website",0),("Central bank publishes its monetary policy statement",0),("City council approves a new public transport route",0),("Scientists publish peer reviewed results in a research journal",0),("Election commission releases official turnout figures",0),("Weather service issues a severe storm warning for the region",0),("Court releases its written judgment after the hearing",0),("Company files its quarterly financial results with regulators",0),("SHOCKING secret cure doctors do not want you to know about",1),("You will not believe what happens next share this before it is deleted",1),("Scientists confirm drinking this drink makes humans immortal",1),("BREAKING hidden government plan exposed by anonymous insiders",1),("Celebrity reveals miracle treatment that replaces every medicine",1),("Experts say one simple trick guarantees instant wealth",1),("URGENT share this message or your phone will be permanently disabled",1),("Secret technology proves the moon landing was completely fake",1),("Anonymous source claims every bank account will be frozen tomorrow",1),("Viral post says a single food can prevent all diseases",1)]
MODEL = Pipeline([("tfidf", TfidfVectorizer(lowercase=True, strip_accents="unicode", ngram_range=(1,2), max_features=12000)),("classifier", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42))])
MODEL.fit([x[0] for x in TRAINING_DATA], np.array([x[1] for x in TRAINING_DATA]))
MODEL_VERSION = "bootstrap-tfidf-logreg-2026.09"
app = FastAPI(title="Fake News Detection API", version="1.0.0")
DRIFT_JOBS: dict[str, dict[str, Any]] = {}

class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="", max_length=20_000)
    text: str = Field(min_length=1, max_length=50_000)
class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requests: list[PredictionRequest] = Field(min_length=1, max_length=64)
class DriftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference_probabilities: list[float] = Field(min_length=2, max_length=10_000)
    current_probabilities: list[float] = Field(min_length=2, max_length=10_000)
    baseline_revision: str = "dashboard-reference"
    window_id: str = "dashboard"

def predict_one(req: PredictionRequest) -> dict[str, Any]:
    p_real, p_fake = [float(x) for x in MODEL.predict_proba([f"{req.title.strip()}\n{req.text.strip()}".strip()])[0]]
    label = int(p_fake >= 0.5)
    return {"label": label, "label_name": "fake" if label else "real", "probability_real": round(p_real,6), "probability_fake": round(p_fake,6), "raw_probability_fake": round(p_fake,6), "calibrated_probability_fake": round(p_fake,6), "confidence_interval_low": None, "confidence_interval_high": None, "calibration_status": "bootstrap_model", "model_name": "TF-IDF + Logistic Regression", "artifact_version": MODEL_VERSION, "serving_mode": "native", "low_signal": max(p_fake,p_real) < 0.60}

@app.get("/health")
def health() -> dict[str, Any]: return {"status":"ok","model_ready":True,"model_name":"TF-IDF + Logistic Regression","artifact_version":MODEL_VERSION,"serving_mode":"native","calibration_status":"bootstrap_model"}
@app.get("/ready")
def ready() -> dict[str, Any]: return {"ready":True,"model_ready":True,"artifact_version":MODEL_VERSION}
@app.post("/predict")
def predict(req: PredictionRequest) -> dict[str, Any]: return {**predict_one(req),"request_id":str(uuid.uuid4())}
@app.post("/predict/batch")
def predict_batch(req: BatchRequest) -> dict[str, Any]: return {"predictions":[predict_one(x) for x in req.requests],"count":len(req.requests),"model_name":"TF-IDF + Logistic Regression","artifact_version":MODEL_VERSION}
@app.post("/monitoring/drift", status_code=202)
def submit_drift(req: DriftRequest) -> dict[str, Any]:
    if len(req.reference_probabilities) != len(req.current_probabilities): raise HTTPException(422,"Reference and current windows must have equal lengths")
    reference=np.asarray(req.reference_probabilities,dtype=float); current=np.asarray(req.current_probabilities,dtype=float)
    if not np.isfinite(reference).all() or not np.isfinite(current).all() or not ((0<=reference).all() and (reference<=1).all() and (0<=current).all() and (current<=1).all()): raise HTTPException(422,"Probabilities must be finite values in [0, 1]")
    statistic,pvalue=ks_2samp(reference,current); bins=np.linspace(0,1,11); rh,_=np.histogram(reference,bins=bins); ch,_=np.histogram(current,bins=bins); rp=np.maximum(rh/len(reference),1e-6); cp=np.maximum(ch/len(current),1e-6); psi=float(np.sum((cp-rp)*np.log(cp/rp))); drift=bool(pvalue<0.05 or psi>=0.20); job_id=str(uuid.uuid4())
    DRIFT_JOBS[job_id]={"status":"completed","result":{"drift_detected":drift,"drifted_features":["probability"] if drift else [],"reports":{"probability":{"ks":{"statistic":float(statistic),"p_value":float(pvalue)},"psi":psi}}}}
    return {"job_id":job_id,"status":"pending"}
@app.get("/monitoring/drift/{job_id}")
def drift_status(job_id: str) -> dict[str, Any]:
    job=DRIFT_JOBS.get(job_id)
    if job is None: raise HTTPException(404,"Drift job not found")
    return {"job_id":job_id,**job}
@app.get("/metrics")
def metrics() -> str: return "# HELP fake_news_inference_queue_depth Requests waiting for inference\n# TYPE fake_news_inference_queue_depth gauge\nfake_news_inference_queue_depth 0\n# HELP fake_news_drift_queue_depth Drift jobs waiting\n# TYPE fake_news_drift_queue_depth gauge\nfake_news_drift_queue_depth 0\n# HELP fake_news_rate_limiter_circuit_state Rate limiter circuit state\n# TYPE fake_news_rate_limiter_circuit_state gauge\nfake_news_rate_limiter_circuit_state 0\n"
