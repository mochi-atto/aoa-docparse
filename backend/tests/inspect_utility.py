# backend/tests/inspect_utility.py
from llama_index.core import SimpleDirectoryReader

documents = SimpleDirectoryReader(input_files=["sample_docs/sample_utility.pdf"]).load_data()
for i, doc in enumerate(documents):
    print(f"--- Page {i+1} ---")
    print(repr(doc.text[:500]))  # repr to see whitespace/empty strings
    print(f"Length: {len(doc.text)}")