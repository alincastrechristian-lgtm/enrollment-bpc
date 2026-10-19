# Examples

## Certificate of Registration

[Download the compact example COR PDF](certificate-of-registration-compact.pdf).

This example uses fictional student details and is clearly marked **NOT VALID FOR REGISTRATION**. Its compact layout includes birth date, sex, program name and code, enrollment information, registered subjects, total units, and the CHED UniFAST / TESDA provincial scholarship notices. Itemized fee details, grades, signatures, and seals are omitted.

Generated with the same PDF renderer used by the website. Regenerate from the repository root:

```sh
pnpm exec tsx scripts/generate-cor-example.ts
```

## Clearance template and identity test

The returning-student flow now runs in the system:

1. Registrar/admin finalizes the current enrollment's grades.
2. Student opens **Enrollment**, uploads a completed clearance, and confirms its detected outline.
3. **Check and save clearance** validates printed text, logo/structure and required term on the server, then checks the configured office cleared checkboxes and signature/stamp spaces. Blank reference ink is excluded when measuring added marks. Failed or uncertain evidence blocks the next step.
4. Personal information verification is explicitly reserved and deferred. The uploaded document's name/number are not checked yet. Saved definition snapshots retain personal input boxes and upload corners for that later work.
5. Passing checks save the image privately in Garage. The student separately selects **Request enrollment**.
6. Registrar/admin opens **Enrollment requests**, reviews the original clearance and findings, then verifies it or returns it with a correction reason. The student can replace a rejected submission and request again.
7. Verified clearance unlocks the existing **Enroll for next term** action. Required Registrar meetings for failed grades still apply; enrollment remains a staff action. The new term starts with draft grades and no inherited clearance approval.

Before use, an administrator must save the template's permanent areas, term, and at least one office row with both its cleared checkbox and signature/stamp box. Template term must match the enrollment being cleared. Uploads support JPG/PNG/WebP up to 10 MiB and 40 megapixels. Sharp decodes and bounds images; Tesseract uses bundled English data, so server OCR needs no runtime language download. One server check runs at a time, with a two-minute timeout; a busy server returns a retry message. No Ollama call or handwriting identity check runs here.

Migration `0036_clearance_submission` adds the per-enrollment upload, definition/corner snapshot, server findings, request state and reviewer attribution. It leaves existing profiles, grades, enrollments and previously verified clearances intact. First enrollment and dropped-enrollment restoration retain their existing staff flows. Application rollback can leave the added table unused; do not drop it after submissions exist. Clearances are readable only by their owner or registrar/admin, through `/user/clearance-files/[id]`; object keys and storage credentials are not sent to clients. A successful upload does not itself request enrollment or verify clearance. Client-provided check results cannot satisfy the server gate.

Uploads recheck enrollment/template revisions before committing and preserve existing files on failure. A request racing a replacement upload prevents replacement. Pending or verified requests cannot be overwritten. Reopening grades or dropping enrollment invalidates its submission; stale reviews and request IDs cannot approve a replacement. After requesting, later template changes do not erase the submitted evidence snapshot. Signature/stamp checking establishes mark presence only; staff review still decides clearance approval.

Checkbox checking locates the printed frame near each saved box and inspects its interior, excluding the frame and isolated specks. Missing or uncertain outlines require review. Reports from the earlier whole-box checker cannot support new enrollment requests or staff verification; unreviewed students can replace those uploads and run the current checks, including previously pending requests. Existing staff approvals remain valid. Signature/stamp presence checks are unchanged.

Focused flow checks:

```sh
node --test tests/clearance-flow.test.mjs tests/clearance-settings.test.mjs tests/student-first.test.mjs tests/enrollment-corrections.test.mjs tests/sidebar-navigation.test.mjs
node --import tsx --test tests/clearance-checker.test.ts
node --test tests/clearance-student.browser.mjs
```

The first suite covers state transitions, access control, rejected/uncertain results, stale data, race cleanup and academic enrollment gates. The server checker tests real template OCR and added marks without network downloads. The isolated student browser test checks the upload/request UI and mobile layout without changing live records.

Administrators manage the shared template at **Settings → Clearance** (`/user/settings/clearance`). A multipart remote form in `src/lib/actions/clearance.remote.ts` accepts JPG, PNG or WebP up to 10 MiB. Garage stores the private image; migration `0034_clearance_template` adds its current revision and file metadata to SQLite. Page access, metadata query and upload are admin-only. Signed-in users can read the template image through the application, without receiving Garage credentials or arbitrary object access.

Replacement uploads a new object before updating the current reference. Stale admin forms are rejected, failed saves preserve the previous template, and the old object is removed after a successful replacement. A cleanup failure reports a warning while keeping the new template usable. The migration is additive: rolling back the application can leave the new table unused; existing account and enrollment data stays unchanged.

On the same settings page, **Mark template details** sets up the reference:

1. Confirm the page or form outline, then choose **Use this outline**.
2. Add at least two text areas for school name and form title, and enter the exact printed wording. Add a logo or permanent structure area for visual comparison. Add separate semester and academic year areas. Additional department headings or printed labels can also be marked; up to 20 areas are supported.
3. Drag boxes over the aligned reference and resize their corners, or enter percentage coordinates. Mark whole printed lines with a little margin. Exclude student handwriting, signatures and checkbox interiors. Logos and headings can be at the side or elsewhere; their saved positions define the layout.
4. Set the required semester and consecutive academic years, then **Save template areas**. If a semester line includes the academic year, it may be marked as a whole line for better OCR context, while the year is still checked separately.

The separate **4. Personal information input areas** step maps where students write their name, student number, course, year and section. **Auto-detect personal inputs** reads printed labels and nearby writing rules to estimate the blank input areas. A name caption underneath a signature line produces a box above the caption; inline labels produce boxes to their right. Review the preview, change field assignments or boxes as needed, then **Use personal input suggestions**. Discarding or cancelling preserves the existing personal-area draft.

Use separate course, year and section boxes when the form separates those inputs. The supplied clearance has one shared line, so detection stores a single **Course, year and section (combined)** area instead of inventing boundaries. Missing inputs can be marked manually with the same drag, resize and numeric controls. These estimates need confirmation, especially on unfamiliar layouts.

**Save template areas** saves both the printed setup and the optional personal boxes through the existing admin-only, revision-checked command. Personal boxes live in `definition.personalFields` as field identifiers and normalized coordinates, using the same saved reference outline. No new database migration is needed: the existing JSON definition stores them. Legacy definitions without this property remain valid; older saves that omit it preserve existing boxes, while an explicit empty array clears them. Replacing the reference clears these boxes with the rest of its setup. Actual student values are never stored in this configuration. Personal boxes are reserved for later extraction and do not participate in permanent-format matching or automatically enable handwriting verification.

After confirming the outline, **Auto-detect areas** can prepare the draft. Browser OCR finds text lines and their positions anywhere on the form, suggests school/title and separate semester/year areas, and fills readable text and term values. Image analysis suggests compact graphic areas such as seals or logos. Graphic identity and permanence cannot be established from one blank image, so every candidate needs review; handwriting/variable-field labels, long rules and checkbox choices are filtered where identifiable.

The separate **5. Offices, checkboxes and signatures** step links each office to its printed name box, **Cleared** checkbox, and signature/stamp space. **Auto-detect office rows** combines printed office labels, square outlines, nearby choice captions or column headings, and signature underlines or table-cell borders. A single checkbox per office is used directly; when both choices exist, only **Cleared** is mapped. Horizontal row alignment allows vertical tolerance; it does not assume every item has exactly the same Y coordinate. All three boxes for the selected office appear together: green for the office name, blue for its checkbox, and purple for its signature/stamp space. Drag any box directly to select and move it; use the legend to select a box for corner resizing or numeric edits. Remove unwanted rows or optional boxes, or select an unmarked legend item and draw its missing box. Missing evidence remains unassigned instead of guessing a checkbox role or signature location.

Detected offices go directly into the visible draft: **Save template areas** includes them immediately, without an extra Apply step. **Discard office suggestions** restores the office rows from before detection. Cancelling or failing detection preserves the current draft. Saving stores these optional mappings in `definition.officeRows`, using normalized coordinates and the same reference outline. Existing definitions remain valid, omitted office rows in older saves preserve the current mappings, and `[]` explicitly clears them. The existing admin-only remote command, revision checks and private Garage reference are reused; no database migration is needed. Replacing the reference resets all mappings. Detection and editing are browser-local until saving. This step maps locations for later inspection; it does not evaluate student marks, authenticate signatures or approve a clearance.

Detection first shows a preview. Select any suggestion to see its box highlighted on the reference beside the list; its trash button removes that suggestion before applying. **Discard suggestions** keeps the current areas. **Use suggestions — replace draft areas** copies only the remaining suggestions into the editable draft; change labels, area types, text and boxes as needed, remove false candidates and add missing details. Removed semester/year suggestions do not fill term values. Required term values are filled only from sufficiently clear, valid readings. Unreadable or missing details stay flagged for manual setup. Nothing persists until **Save template areas**. Cancellation or failure keeps existing draft areas, and detection never uploads the reference or modifies student records. The OCR engine/language data may download on first use.

The `saveClearanceAreas` remote command is admin-only and checks the template revision. Migration `0035_clearance_areas` adds a nullable JSON definition; existing files and records are preserved. Saving areas changes the revision without reuploading the image. Replacing the reference clears its areas, so a different layout cannot accidentally inherit the old setup. Stale image-revision requests are rejected. Application rollback can leave the nullable column unused without deleting data.

**Test a clearance** accepts a filled JPG, PNG or WebP up to 15 MB. Confirm the detected submission outline and compare against the saved reference areas and term. Text is sampled directly from original pixels; OCR must read the expected wording in the marked positions. Visual patches compare shapes with exposure and small alignment tolerance; an empty patch cannot match. Results distinguish **Matches saved template**, **Needs review**, and **Does not match saved template**. Uncertain evidence never approves a scan. Format matching does not authenticate the document.

Test scans stay in the browser; no Garage upload, student update, identity check or signature verification occurs. The saved image and area definition persist. Reload discards test scans, and changing the saved reference resets the test. Settings and `/test` share the configured matcher in `src/lib/clearance`.

While signed in, `/test` uses the saved area definition when a shared template exists. A reference without areas requires admin setup first. Custom templates support format checking only: the lab’s handwriting and signature tools still assume the original BPC five-department layout and remain locked for custom references.

Without a saved shared template, `/test` retains its original BPC-only lab with built-in examples and temporary local blank-template overrides. That path uses fixed school/title/department positions and printed-ink layout checks. Only **Template matches** unlocks its identity and full-inspection tools. Changing an image, outline or required term clears the gate and previous evidence. Staff compare against Jonnel Mrei Palileo’s local test record (`MA-23016578`); a student account compares against its own database record.

The app sends only the name and student-number crops to Ollama using `qwen3-vl:4b`. Set `OLLAMA_BASE_URL` in `.env` to change the server; the current default is `http://192.168.254.63:11434`. Expected identity stays outside model prompts. Submitted scans and recognition results are not saved by the test page.

An exact student number supports a match unless the name strongly differs. Without an exact number, one differing digit, a missing printed `MA-` prefix, or a name similarity of at least 80% produces **Needs confirmation**. Name-only matches also require confirmation. Blank or unrelated text cannot produce a match. Percentages measure character similarity, not model confidence or document validity.

Course and section do not affect this identity check. The separate full inspection still checks the template, term and department marks. Neither action updates enrollment or verifies clearance.

Run focused checks:

```sh
node --test tests/clearance-settings.test.mjs tests/clearance-definition.test.mjs tests/clearance-personal-fields.test.mjs tests/clearance-offices.test.mjs tests/clearance-suggestions.test.mjs tests/clearance-template.test.mjs tests/clearance-identity.test.mjs tests/clearance-prototype.test.mjs tests/clearance-border.test.mjs tests/sidebar-navigation.test.mjs
```

With the Vite dev server running, Chrome installed and OCR download access, run the real-image regression separately:

```sh
node --test tests/clearance-ocr.browser.mjs tests/clearance-office.browser.mjs
```

This checks automatically detected outlines on both supplied photos, exact school recognition, and rejection of another school, semester or year. It also verifies a different template with branding on the side and rejects changed logos, wording and positions. Automatic area discovery is checked against the real blank reference, a portrait form with side branding, an empty page and cancellation. Personal input discovery is checked on the real combined-line form and a portrait form with separate course/year/section inputs. Office discovery checks all five supplied offices, their cleared checkboxes and signature spaces, plus cancellation. It makes no server uploads or record changes.

With a configured template and a local admin account, `node --test tests/clearance-office-editor.browser.mjs` checks that saving includes the detected offices without another Apply step, all three boxes move independently, corner resizing and Escape work, mobile checkboxes remain draggable, and discarding restores the original office draft. It uses the blank fixture and intercepts every Save before it reaches the server. Set `CLEARANCE_ADMIN_TEST_URL` to use a different local server; login uses `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` or the seed demo defaults.
