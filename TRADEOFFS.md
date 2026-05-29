# Tradeoffs

1. No authentication or SSO.
- I kept tenant scoping explicit, but I did not build user auth because it would distract from the ingestion/review problem.

2. No background queue.
- Imports are synchronous and small. For a 4-day prototype, a task queue would add infrastructure without improving the core review flow.

3. No production-grade factor library.
- I used simple prototype emission factors and unit conversions for the demo data. In a real deployment those factors should come from a governed source and be versioned.

4. No PDF/OCR utility ingestion.
- Utility PDFs are realistic, but they would require OCR or a document parser and would consume time that is better spent on the normalization and audit model.

5. No full SAP integration.
- The assignment is about judgment, not building a complete SAP connector. I used a realistic CSV shape that matches SAP’s documented procurement export style.
