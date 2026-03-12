FROM python:3.11-slim

# Install WeasyPrint system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libcairo2 \
    libglib2.0-0 \
    libxml2 \
    libxslt1.1 \
    fonts-liberation \
    fontconfig \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads/payment_proofs uploads/logos uploads/signatures uploads/expense_receipts

COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
