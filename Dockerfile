FROM python:3.11-slim

WORKDIR /app

# 安裝系統套件
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Python 套件
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製後端程式
COPY backend/ ./backend/

# 複製前端（需要先在 host 建置）
COPY frontend/dist/ ./frontend/dist/

# 建立必要目錄
RUN mkdir -p /app/vars /app/logs /app/automation

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "/app/backend"]
