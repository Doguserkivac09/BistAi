"""
BistAI — ML Tahmin Servisi (Phase 13.5)

FastAPI + XGBoost ile sinyal kalite tahmini.
Teknik + Makro özelliklerden BUY/HOLD/SELL olasılığı üretir.

Deploy: Railway veya Render (ücretsiz tier)
Env: PORT (Railway otomatik set eder)
"""

import os
import json
import pickle
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# XGBoost opsiyonel — yoksa heuristic fallback
try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False
    logging.warning("xgboost yüklü değil, heuristic fallback kullanılacak.")

# ── Logging ──────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── FastAPI ───────────────────────────────────────────────────────────

app = FastAPI(
    title="BistAI ML Service",
    description="BIST sinyal kalite tahmin servisi — XGBoost",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Model ─────────────────────────────────────────────────────────────

MODEL_PATH = Path(__file__).parent / "model.pkl"
model = None  # Global model referansı

FEATURE_NAMES = [
    "rsi14",
    "macdHistogram",
    "bbPosition",
    "volumeRatio",
    "priceChange5d",
    "priceChange20d",
    "atr14Pct",
    "signalTypeCode",
    "directionCode",
    "severityCode",
    "macroScore",
    "riskScore",
]

LABELS = ["SELL", "HOLD", "BUY"]


def load_or_train_model():
    """Model dosyası varsa yükle, yoksa basit bir model eğit."""
    global model

    if MODEL_PATH.exists() and XGB_AVAILABLE:
        try:
            with open(MODEL_PATH, "rb") as f:
                model = pickle.load(f)
            logger.info("Model yüklendi: %s", MODEL_PATH)
            return
        except Exception as e:
            logger.warning("Model yüklenemedi: %s — yeniden eğitiliyor", e)

    if XGB_AVAILABLE:
        logger.info("Sentetik veri ile XGBoost modeli eğitiliyor...")
        model = _train_synthetic_model()
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
        logger.info("Model eğitildi ve kaydedildi.")
    else:
        logger.info("XGBoost yok, heuristic fallback aktif.")


def _train_synthetic_model():
    """
    Gerçek veri gelene kadar kullanılacak sentetik eğitim modeli.

    Kural mantığı:
    - RSI < 30 + yükseliş yönü + pozitif makro → BUY
    - RSI > 70 + düşüş yönü + negatif makro → SELL
    - Diğerleri → HOLD

    1000 sentetik örnek üretip XGBoost eğitir.
    Gerçek sinyal performans verisi gelince /retrain ile güncellenebilir.
    """
    np.random.seed(42)
    n = 2000

    X = np.column_stack([
        np.random.uniform(0, 100, n),       # rsi14
        np.random.uniform(-1, 1, n),        # macdHistogram
        np.random.uniform(0, 1, n),         # bbPosition
        np.random.uniform(0.2, 5, n),       # volumeRatio
        np.random.uniform(-20, 20, n),      # priceChange5d
        np.random.uniform(-30, 30, n),      # priceChange20d
        np.random.uniform(0, 0.1, n),       # atr14Pct
        np.random.randint(0, 4, n),         # signalTypeCode
        np.random.randint(0, 3, n),         # directionCode
        np.random.randint(0, 3, n),         # severityCode
        np.random.uniform(-100, 100, n),    # macroScore
        np.random.uniform(0, 100, n),       # riskScore
    ])

    # Sentetik etiket mantığı
    y = np.ones(n, dtype=int)  # varsayılan HOLD

    rsi = X[:, 0]
    direction = X[:, 8]
    macro = X[:, 10]
    risk = X[:, 11]
    macd = X[:, 1]

    # BUY koşulları
    buy_mask = (
        (rsi < 40) & (direction == 2) & (macro > 20) & (risk < 60) & (macd > 0)
    ) | (
        (rsi < 30) & (direction == 2) & (macro > 0)
    )
    y[buy_mask] = 2

    # SELL koşulları
    sell_mask = (
        (rsi > 65) & (direction == 0) & (macro < -20) & (risk > 50)
    ) | (
        (rsi > 75) & (direction == 0)
    )
    y[sell_mask] = 0

    # Gürültü ekle (gerçekçilik için)
    noise_idx = np.random.choice(n, size=int(n * 0.1), replace=False)
    y[noise_idx] = np.random.randint(0, 3, size=len(noise_idx))

    clf = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
        verbosity=0,
    )
    clf.fit(X, y)
    return clf


# ── Schema ────────────────────────────────────────────────────────────

class PredictionRequest(BaseModel):
    rsi14: float = Field(..., ge=0, le=100, description="RSI(14) değeri")
    macdHistogram: float = Field(..., ge=-1, le=1, description="Normalize MACD histogram")
    bbPosition: float = Field(..., ge=0, le=1, description="Bollinger band pozisyonu")
    volumeRatio: float = Field(..., ge=0, le=5, description="Hacim/20G-ort oranı")
    priceChange5d: float = Field(..., description="5 günlük fiyat değişimi %")
    priceChange20d: float = Field(..., description="20 günlük fiyat değişimi %")
    atr14Pct: float = Field(..., ge=0, description="ATR/fiyat oranı")
    signalTypeCode: int = Field(..., ge=0, le=3, description="0=rsi_div,1=volume,2=trend,3=sr_break")
    directionCode: int = Field(..., ge=0, le=2, description="0=düşüş,1=nötr,2=yükseliş")
    severityCode: int = Field(..., ge=0, le=2, description="0=zayıf,1=orta,2=güçlü")
    macroScore: float = Field(..., ge=-100, le=100, description="Makro skor")
    riskScore: float = Field(..., ge=0, le=100, description="Risk skoru")


class PredictionResponse(BaseModel):
    prediction: str              # BUY / HOLD / SELL
    confidence: float            # 0–1
    probabilities: dict          # {"BUY": 0.6, "HOLD": 0.3, "SELL": 0.1}
    model_type: str              # "xgboost" | "heuristic"
    feature_importances: Optional[dict] = None


class RetrainRequest(BaseModel):
    features: list[list[float]]  # [[f1,f2,...], ...]
    labels: list[int]            # [0=SELL, 1=HOLD, 2=BUY, ...]


# ── Heuristic Fallback ────────────────────────────────────────────────

def heuristic_predict(req: PredictionRequest) -> PredictionResponse:
    """XGBoost yoksa basit kural tabanlı tahmin."""
    buy_score = 0.0
    sell_score = 0.0

    # RSI
    if req.rsi14 < 30:
        buy_score += 0.3
    elif req.rsi14 > 70:
        sell_score += 0.3

    # Yön
    if req.directionCode == 2:
        buy_score += 0.2
    elif req.directionCode == 0:
        sell_score += 0.2

    # Makro
    if req.macroScore > 30:
        buy_score += 0.2
    elif req.macroScore < -30:
        sell_score += 0.2

    # Risk
    if req.riskScore > 70:
        sell_score += 0.15
        buy_score -= 0.1

    # MACD
    if req.macdHistogram > 0.2:
        buy_score += 0.1
    elif req.macdHistogram < -0.2:
        sell_score += 0.1

    buy_score = max(0, min(1, buy_score))
    sell_score = max(0, min(1, sell_score))
    hold_score = max(0, 1 - buy_score - sell_score)

    total = buy_score + hold_score + sell_score
    probs = {
        "BUY": round(buy_score / total, 3),
        "HOLD": round(hold_score / total, 3),
        "SELL": round(sell_score / total, 3),
    }

    prediction = max(probs, key=lambda k: probs[k])  # type: ignore[arg-type]
    confidence = probs[prediction]

    return PredictionResponse(
        prediction=prediction,
        confidence=confidence,
        probabilities=probs,
        model_type="heuristic",
    )


# ── Endpoints ─────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    load_or_train_model()
    logger.info("BistAI ML servisi hazır.")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "xgboost_available": XGB_AVAILABLE,
        "model_type": "xgboost" if (model is not None and XGB_AVAILABLE) else "heuristic",
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(req: PredictionRequest):
    if model is None or not XGB_AVAILABLE:
        return heuristic_predict(req)

    features = np.array([[
        req.rsi14, req.macdHistogram, req.bbPosition,
        req.volumeRatio, req.priceChange5d, req.priceChange20d,
        req.atr14Pct, req.signalTypeCode, req.directionCode,
        req.severityCode, req.macroScore, req.riskScore,
    ]])

    proba = model.predict_proba(features)[0]
    pred_idx = int(np.argmax(proba))
    prediction = LABELS[pred_idx]
    confidence = float(proba[pred_idx])

    probs = {LABELS[i]: round(float(p), 3) for i, p in enumerate(proba)}

    # Feature importance (sadece XGBoost'ta mevcut)
    importances = None
    if hasattr(model, "feature_importances_"):
        importances = {
            name: round(float(imp), 4)
            for name, imp in zip(FEATURE_NAMES, model.feature_importances_)
        }

    return PredictionResponse(
        prediction=prediction,
        confidence=confidence,
        probabilities=probs,
        model_type="xgboost",
        feature_importances=importances,
    )


@app.post("/retrain")
def retrain(req: RetrainRequest):
    """
    Gerçek sinyal performans verileriyle modeli yeniden eğitir.
    Next.js backend tarafından çağrılır.
    """
    if not XGB_AVAILABLE:
        raise HTTPException(status_code=503, detail="XGBoost yüklü değil.")

    if len(req.features) < 50:
        raise HTTPException(status_code=400, detail="En az 50 örnek gereklidir.")

    if len(req.features) != len(req.labels):
        raise HTTPException(status_code=400, detail="feature ve label sayısı eşleşmiyor.")

    X = np.array(req.features)
    y = np.array(req.labels)

    global model
    clf = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
        verbosity=0,
    )
    clf.fit(X, y)
    model = clf

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    return {"status": "ok", "samples_trained": len(req.features)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
