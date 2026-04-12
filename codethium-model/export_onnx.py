"""One-time script: export tiny_transformer.pth → tiny_transformer.onnx

Usage:
    cd codethium-model
    pip install torch sentencepiece   # if not already installed
    python export_onnx.py
"""
import sys
import torch
import sentencepiece as spm

# Allow torch.load to resolve model_components classes
sys.modules["__main__"] = __import__("model_components")
from model_components import Vocab, tinyTransformerDecoderOnly

# Load SentencePiece processor and vocab
sp = spm.SentencePieceProcessor()
sp.load("fullspm.model")

vocab = torch.load("vocab.pth", map_location="cpu", weights_only=False)
if not isinstance(vocab, Vocab):
    v = Vocab(sp)
    v.id2token = vocab["id2token"]
    v.token2id = vocab["token2id"]
    vocab = v

# Build model and load weights
model = tinyTransformerDecoderOnly(
    vocab_size=vocab.size(), d_model=256, n_heads=4, n_layers=4, max_seq_len=512
).eval()

sd = torch.load("tiny_transformer.pth", map_location="cpu", weights_only=True)
if isinstance(sd, dict) and "model_state_dict" in sd:
    sd = sd["model_state_dict"]
model.load_state_dict(sd)

# Export to ONNX
dummy = torch.randint(0, vocab.size(), (1, 16))
torch.onnx.export(
    model,
    dummy,
    "tiny_transformer.onnx",
    input_names=["input_ids"],
    output_names=["logits"],
    dynamic_axes={
        "input_ids": {0: "batch", 1: "seq"},
        "logits": {0: "batch", 1: "seq"},
    },
    opset_version=18,
)

# Also export vocab as JSON for torch-free loading
import json
vocab_data = {"id2token": vocab.id2token, "token2id": vocab.token2id}
with open("vocab.json", "w", encoding="utf-8") as f:
    json.dump(vocab_data, f, ensure_ascii=False)

print("Exported: tiny_transformer.onnx, vocab.json")
