# Complete system guide assets

Updated 20 October 2026 from application baseline `eb9988d`.

- Main document: `../Enrollment-System-Complete-Guide.docx`.
- Editable prose: `../system-guide-source.md`.
- Thirty-five flowcharts are supplied as SVG for editing and PNG for document embedding.
- `flowcharts.json` records node text, layout, and connections. A vertical bar in node text denotes a line break.
- Edges identify source, target, label, exit side and entry side; an optional sixth field supplies explicit SVG routing waypoints.
- Asset filename numbers identify diagrams; document figure numbers follow their reading order and may differ.

The DOCX contains all thirty-five images and does not require this folder to display them. It includes linked contents, twenty-five chapters, four appendices, twenty-nine tables, and eighty possible defense questions with suggested answers. Chapter 24 covers required academic documents; Chapter 25 contains defense preparation. Current coverage includes scoped notification visibility, derived clearance reminders, online/paper approval, optional identity checks, Gemini/OpenAI/Ollama settings, bounded scans, encrypted credentials, curriculum-specific frozen prerequisites, setup recovery, student CSV intake and semester GWA. Same-term reopening retains clearance; term changes invalidate approval while retaining the file. Public prose is based on source inspection, without copying live student records or environment secrets.

Validation checks ZIP/XML integrity, relationship targets, chapter links, styles, thirty-five embedded images, and a local visual preview derived from the DOCX. Application tests listed in the guide are relevant evidence to run for a defense; this documentation update does not claim a new full application test run. Native Word pagination is not verified; Word can update the contents field to show page numbers.

This refresh validates generated document/diagram structure, sequential question numbering, source references and a local content preview. It does not rerun application suites, migrate a database or contact live providers. Earlier implementation test results are not a current full-suite pass.
