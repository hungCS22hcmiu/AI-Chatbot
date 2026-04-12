"""ONNX-based inference server — drop-in replacement for decoder_only_model.py.

Uses onnxruntime (~40 MB) instead of PyTorch (~620 MB) for the forward pass,
and NumPy for top-k / top-p sampling.
"""
import os
import json

import numpy as np
import onnxruntime as ort
import sentencepiece as spm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_DIR = os.environ.get("MODEL_DIR", os.path.dirname(os.path.abspath(__file__)))

# ── Load ONNX model ──────────────────────────────────────────────────────────
session = ort.InferenceSession(
    os.path.join(MODEL_DIR, "tiny_transformer.onnx"),
    providers=["CPUExecutionProvider"],
)

# ── Load SentencePiece tokeniser ──────────────────────────────────────────────
sp_processor = spm.SentencePieceProcessor()
sp_processor.load(os.path.join(MODEL_DIR, "fullspm.model"))

# ── Load vocab (torch-free JSON version) ──────────────────────────────────────
with open(os.path.join(MODEL_DIR, "vocab.json"), "r", encoding="utf-8") as f:
    _vocab_data = json.load(f)


class Vocab:
    def __init__(self, data: dict):
        self.id2token: list[str] = data["id2token"]
        self.token2id: dict[str, int] = data["token2id"]

    def encode(self, pieces: list[str]) -> list[int]:
        unk = self.token2id.get("<UNK>", 0)
        return [self.token2id.get(p, unk) for p in pieces]

    def decode(self, ids: list[int]) -> list[str]:
        n = len(self.id2token)
        return [self.id2token[i] if 0 <= i < n else "<ERR>" for i in ids]

    def size(self) -> int:
        return len(self.id2token)


vocab = Vocab(_vocab_data)

MAX_SEQ_LEN = 512  # must match the model's max_seq_len


# ── Sampling helpers (NumPy equivalents of the torch originals) ───────────────
def _softmax(logits: np.ndarray) -> np.ndarray:
    e = np.exp(logits - logits.max())
    return e / e.sum()


def _sample_logits(logits: np.ndarray, top_k: int = 50, top_p: float = 0.9,
                   temperature: float = 0.9) -> int:
    logits = logits / max(temperature, 1e-8)

    if top_k > 0:
        topk_idx = np.argpartition(logits, -top_k)[-top_k:]
        mask = np.full_like(logits, -1e9)
        mask[topk_idx] = logits[topk_idx]
        logits = mask

    if top_p > 0.0:
        sorted_idx = np.argsort(logits)[::-1]
        sorted_logits = logits[sorted_idx]
        cum_probs = np.cumsum(_softmax(sorted_logits))
        cutoff = np.searchsorted(cum_probs, top_p) + 1
        keep = sorted_idx[:cutoff]
        mask = np.full_like(logits, -1e9)
        mask[keep] = logits[keep]
        logits = mask

    probs = _softmax(logits)
    return int(np.random.choice(len(probs), p=probs))


# ── Autoregressive generation ─────────────────────────────────────────────────
def generate(prompt: str, max_new_tokens: int = 200, top_k: int = 50,
             top_p: float = 0.9, temperature: float = 0.9) -> str:
    pieces = sp_processor.encode(prompt, out_type=str)
    ids = vocab.encode(pieces)

    for _ in range(max_new_tokens):
        # Truncate to model's max context window
        input_ids = np.array([ids[-MAX_SEQ_LEN:]], dtype=np.int64)
        logits = session.run(None, {"input_ids": input_ids})[0]  # (1, seq, vocab)
        last_logits = logits[0, -1, :]

        next_id = _sample_logits(last_logits, top_k, top_p, temperature)
        ids.append(next_id)

        if next_id < vocab.size() and vocab.id2token[next_id] == "<EOS>":
            break

    toks = vocab.decode(ids)
    output = sp_processor.decode_pieces(toks) if hasattr(sp_processor, "decode_pieces") else "".join(toks)
    output = (output.replace("<BOS> #", "").replace("<EOS>", "")
              .replace("<PAD>", "").replace("<NL>", "\n").replace("::", ":"))
    return output


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
def chat(req: ChatRequest):
    prompt = "<BOS> # problem: " + req.message.strip() + " <NL> "
    output = generate(prompt)
    return {"reply": output}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("inference_onnx:app", host="0.0.0.0", port=8000)
