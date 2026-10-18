# AI drawing extraction acceptance

Status: PDF/image-first customer workflow implemented as a guarded draft path; representative customer-project acceptance remains open.

## Product priority

- Customer input is expected to be a plotted PDF or an image/photo of a drawing. The AI authoring entry point presents those formats as the normal route into an editable project.
- A multi-sheet PDF must first be read as a set: identify candidate plan pages, sheet numbers/titles, and levels before proposing model changes. Unclear page/level mapping must be returned as a question, with no commands to commit.
- CAD remains supported for the less common incoming CAD file and for CAD the user authors. DWG/DXF underlay, import/export, and family authoring remain separate workflows; customers are not required to provide CAD.

## Supported input and guarded proposal flow

- The editor accepts one or more PDF, JPEG, or PNG files, up to 8 files and 20 MB combined.
- Each PDF can be previewed in page groups and reduced to selected pages before upload; leaving the selection empty sends the full PDF. The selected original page numbers accompany the subset in the provider request.
- The API validates the declared MIME type against the data URL and file signature before forwarding the drawing to the configured provider. It does not persist the attachment.
- PDF files are sent as file inputs and raster drawings as high-detail image inputs. The request uses the existing provider configuration and authentication mode.
- The default request asks for page/sheet/level identification first. Provider instructions exclude unrelated details, elevations, schedules, and specifications unless requested, and require a clarification when the plan-page mapping is ambiguous.
- The AI returns only a command proposal. The editor previews and validates it through the existing CommandBus path; the user must confirm before execution. The proposal is undoable as one command batch.
- Extraction instructions treat the drawing as an existing building, require evidence for dimensions/scale/levels/hosts, request clarification when required data is missing, and forbid inferring structural or MEP design from an architectural floor plan.
- The image-only workflow is intentional: a single scaled PNG/JPEG can be submitted without elevations or other sheets. In that case only supported 2D geometry should be proposed; unknown vertical properties remain questions.

## Evidence

- `apps/mcp-server/test_server.py`: mocked OpenAI-compatible provider roundtrip for PDF and PNG inputs, including multi-page PDF page-identification instructions, plus malformed signature, attachment count, and size validation.
- `apps/plan-editor/e2e/authoring-workflows.spec.ts`: mocked gateway browser flows for a single image, a multi-sheet PDF and a selected-page PDF subset. Selection checks that original page numbers survive while the sent PDF contains only the chosen pages. The multi-sheet flow checks page/level identification guidance and blocks commit while clarification is pending; the existing AI acceptance covers preview, CommandBus commit, and undo.
- Live provider credentials and customer-file diversity are not available in automated acceptance. Representative scanned drawings and vector PDFs with multiple plan sheets still require human review for page identification, scale calibration, geometry, openings, levels, and source citations.

## Known gaps

- The uploaded source is transient and is not yet saved into project underlays or attached to created objects as source references. Keep the original file with the project review record until persistent drawing provenance is implemented.
- The provider's interpretation is a draft, not a verified survey, permit drawing, structural design, or engineering approval. Do not fill missing measured dimensions with assumed values.
- An in-app PDF page picker is available when the user already knows which pages to send. Automatic page identification still depends on the configured vision-capable provider, and source-page references are not yet persisted on generated objects.
- The drawing is forwarded to the provider selected by the user's existing local or gateway configuration when they submit the request.
- Image calibration and PDF scale calibration are not yet an in-app guided step. Use visible dimensions/scales and verify the draft against the source before accepting it.
