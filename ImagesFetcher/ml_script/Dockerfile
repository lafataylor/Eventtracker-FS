FROM public.ecr.aws/lambda/python:3.9
# FROM python:3.9-slim-buster

COPY requirements.txt .

# RUN apt-get update \
#     && apt-get install -y --no-install-recommends \
#     build-essential \
#     && rm -rf /var/lib/apt/lists/*

RUN python3.9 -m pip install --no-cache-dir -r requirements.txt
RUN python3.9 -m spacy download en

COPY . .

CMD ["mlScript.lambda_handler"]
# CMD ["python3", "./mlScript.py"]
