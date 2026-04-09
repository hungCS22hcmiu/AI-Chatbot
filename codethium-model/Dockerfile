FROM python:3.11-slim
WORKDIR /app

# Install CPU-only PyTorch first (~180MB vs ~2GB for CUDA build)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements-inference.txt .
RUN pip install --no-cache-dir -r requirements-inference.txt

COPY . .
ENV MODEL_DIR=/app
EXPOSE 8000
CMD ["uvicorn", "decoder_only_model:app", "--host", "0.0.0.0", "--port", "8000"]
