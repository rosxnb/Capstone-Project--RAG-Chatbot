# NLLB-Aligned Pipeline

This folder holds the data pipeline for sentence-wise translation with NLLB-600M.

## Stage 1: Extraction (ready)
- Script: `nllb_pipeline/extract.py`
- Reads `scraped_data/**/metadata.jsonl`, prefers the `text/` versions, falls back to raw HTML, and also sweeps `docs/`, `images/`, and other supported files.
- Supports HTML, TXT, PDF (with OCR fallback), DOCX, and images (OCR).
- Output: JSONL at `processed_data/extracted_documents.jsonl` by default, one record per source with `{source_path, source_domain, source_url, kind, language, text, length}`.

Run:
```bash
python nllb_pipeline/extract.py \
  --root scraped_data \
  --output processed_data/extracted_documents.jsonl \
  --ocr-pdf-pages 2 \
  --limit 50      # optional
  --no-images     # optional
```

## Stage 2: Sentence splitting (ready)
- Script: `nllb_pipeline/split_sentences.py`
- Input: `processed_data/extracted_documents.jsonl`
- Output: `processed_data/sentences.jsonl` with per-sentence records `{uid, doc_id, sentence_index, source_path, source_domain, source_url, kind, doc_language, sentence}`.

Run:
```bash
python nllb_pipeline/split_sentences.py \
  --input processed_data/extracted_documents.jsonl \
  --output processed_data/sentences.jsonl \
  --min-chars 2 \
  --limit 1000   # optional
```

## Stage 3: Translation with NLLB-600M (ready)
- Script: `nllb_pipeline/translate_nllb.py`
- Input: `processed_data/sentences.jsonl`
- Output: `processed_data/translated_sentences.jsonl` with added translation metadata.
- Defaults: translates only Nepali (`doc_language == "ne"`) sentences using NLLB language codes `npi_Deva` (src) → `eng_Latn` (tgt).

Run (ensure the model is downloaded/cached):
```bash
python nllb_pipeline/translate_nllb.py \
  --input processed_data/sentences.jsonl \
  --output processed_data/translated_sentences.jsonl \
  --model facebook/nllb-200-distilled-600M \
  --src-lang-code npi_Deva \
  --tgt-lang-code eng_Latn \
  --batch-size 8 \
  --device auto \
  --limit 500   # optional
```

## Stage 4: Embeddings (ready)
- Script: `nllb_pipeline/embed_sentences.py`
- Input: `processed_data/translated_sentences.jsonl`
- Output: FAISS index + metadata in `vector_store/faiss_sentences/`.
- By default embeds the translated English text; add `--no-translation` to embed original sentences.

Run:
```bash
python nllb_pipeline/embed_sentences.py \
  --input processed_data/translated_sentences.jsonl \
  --output-dir vector_store/faiss_sentences \
  --embedding-model sentence-transformers/all-MiniLM-L6-v2 \
  --batch-size 64 \
  --limit 1000   # optional
```

## Next stage (optional)
- Merger/formatter to emit bilingual JSONL/CSV aligned to sentence IDs for RAG or analytics.
