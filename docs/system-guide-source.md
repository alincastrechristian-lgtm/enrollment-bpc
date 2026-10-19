<!-- Editable source for Enrollment-System-Complete-Guide.docx. Source inspection: 19 October 2026. -->
# 1. What the system does

The BPC Enrollment Portal coordinates student accounts, academic catalogs, enrollment records, grades, clearance review, and preparation for another term. It gives administrators broad system control, registrars academic operating tools, and students access to their own academic information and clearance requests.

The central record is an enrollment for one student in one school year and semester. That enrollment owns the curriculum assignment, year level, section, subject attempts, grades, clearance flag, follow-up timestamps, and lifecycle status. A student can have many historical enrollments but has one explicit current-enrollment link. Most current-work screens follow that link rather than guessing from the latest date.

## 1.1 The full student journey

1. An administrator or registrar creates the student's account and personal record. The system assigns a student number and requests a setup email.
2. The student follows the email link and chooses a password. Staff can create the first enrollment before this setup finishes, but grade processing later requires completed setup.
3. Staff chooses a program and its usable published curriculum, reviews the term, selects subjects, and saves the enrollment.
4. Staff enters and saves grades. Those values remain provisional until staff finalizes them.
5. After finalization, the student checks the released results and submits the signed clearance image for the current term.
6. The server checks the template and configured office marks. An all-pass image becomes a saved ready submission.
7. The student explicitly requests enrollment review. Staff then reviews the original document and either rejects it with a reason or verifies it.
8. Verification completes the current enrollment's clearance requirement. Current failed grades additionally require a completed Registrar follow-up before another ordinary enrollment.
9. Staff opens the next-term editor, reviews calculated defaults and outstanding subjects, and saves a new enrollment. The old enrollment remains in history.

![Flowchart 1. Complete student lifecycle. First enrollment is staff-created; later clearance requests do not automatically create another enrollment.](system-guide-assets/01-lifecycle.png)

## 1.2 Records that sound similar but mean different things

| Term | Meaning |
| --- | --- |
| User account | Authentication identity, name, email, role, setup state, access state, and security settings. |
| Student record | Student number, personal details, linked user, and current-enrollment pointer. |
| Program | A course/program catalog entry with an active status and optional selected curriculum. |
| Curriculum | A program-specific plan containing subjects assigned to years and semesters, with units and publication state. |
| Enrollment | One student's actual term registration. It contains its own class details and selected curriculum. |
| Enrollment subject | One subject attempt in an enrollment. It stores subject snapshots, units, and a draft or released grade. |
| Clearance submission | One currently saved image/report for an enrollment, with request and review state. |
| Enrollment request | The student's explicit request for staff to review a saved passing clearance. It is not a self-service enrollment transaction. |
| Completed enrollment | Term has finalized grades and verified clearance. Failed-grade follow-up may still block the next enrollment. |
| Notification | A saved account or academic event. It is not proof that an email reached the recipient's inbox. |

## 1.3 Scope and evidence

This guide describes implemented behavior in the checked-out source on 19 October 2026. The starting commit is `d4b7859`. It does not inspect a live institution's operational database or assume that every optional service is configured. Existing `docs/system-flows.md` helped identify workflows, but current code takes precedence where that document is older.

Flowcharts show major checks and branches. The accompanying procedures specify smaller validation rules, transactions, concurrency protections, and exceptions. A stopped branch means the action is rejected or held until its stated requirement is resolved. Canceling a confirmation leaves the saved data unchanged unless a preceding step has already saved a separate record.

Sources: S01, S02, S07–S16.

# 2. Accounts, responsibilities, and permission boundaries

There are exactly three application roles: `admin`, `registrar`, and `student`. There is no separate applicant, instructor, cashier, office approver, parent, or department account role in the current implementation. Staff enters grades and reviews office clearance evidence through the academic screens.

## 2.1 Permission matrix

| Capability | Administrator | Registrar | Student |
| --- | --- | --- | --- |
| Open dashboard and own profile/security | Yes | Yes | Yes |
| Manage administrator accounts | Create, edit, disable/enable, delete, revoke sessions | No | No |
| Manage registrar accounts | Create, edit, disable/enable, delete, revoke sessions | No account-management screen | No |
| Create/edit student accounts and personal details | Yes | Yes | No |
| Delete a student | Only unfinished setup with no current or historical enrollment | Same rule | No |
| Revoke student sessions | Yes | Yes | No staff session controls |
| Create first/subsequent enrollments | Yes | Yes | No; submits clearance review request only |
| Edit/finalize grades | Current and historical, when allowed by lifecycle | Current only, when allowed by lifecycle | View released own grades only |
| Correct an enrollment | Current/historical enrolled, unfinalized | Current enrolled, unfinalized | No |
| Void an incorrect enrollment | Current/historical, unfinalized, not already voided | Current only, same lifecycle checks | No |
| Reopen finalized grades | Yes, with reason | No | No |
| Review/reject/verify clearance | Yes | Yes | Upload/request own eligible current enrollment |
| Send meeting request and complete follow-up | Yes, with academic checks | Yes, with academic checks | Receives notice; cannot mark meeting completed |
| Drop an enrollment | Current enrolled record only | Same | No |
| Programs, subjects, curricula | Manage | View | Own assigned curriculum only |
| Masterlist and reports | View, export, print | View, export, print | No |
| Notifications | All recorded events | Events attributed to that registrar | Events addressed to own account |
| Configure email, clearance template, storage | Yes | No | No |
| Download COR | Eligible student enrollment | Eligible student enrollment | Own eligible enrollment only |

Administrator self-protection blocks deleting or disabling the currently signed-in administrator account. It does not turn administrators into unrestricted editors of finalized academic records: even an administrator must explicitly reopen finalized grades before changing them.

The sidebar hides unavailable sections, but hiding a link is only a usability feature. Server loaders, remote commands, and download/export endpoints enforce the role and ownership checks. Supplying another student's user ID or enrollment ID does not grant a student access to that record.

![Flowchart 2. Session validation, two-factor challenge, and role-specific portal access. Failed credential or factor checks remain on authentication screens.](system-guide-assets/02-access.png)

## 2.2 Administrator responsibility

The administrator owns staff access, academic catalog maintenance, publication of curricula, outgoing email configuration, clearance form configuration, storage administration, and academic exceptions. Administrators can perform registrar work, inspect historical academic records, and reopen finalized records with a recorded reason.

Administrators should distinguish operational fixes from historical corrections. Renaming a catalog subject does not rewrite saved subject snapshots. Disabling a registrar prevents access while preserving history. Voiding an enrollment preserves evidence of an incorrect record rather than deleting it.

## 2.3 Registrar responsibility

The registrar manages student information and the term workflow: enrollment, grade drafts, finalization, clearance review, meeting requests, follow-up completion, and current-enrollment corrections. Registrars use the masterlist and reports to prepare operational outputs. They can view catalog plans but cannot maintain those catalogs or system settings.

A registrar cannot reopen finalized grades or edit historical grades. Those cases require an administrator. The resend-setup backend command permits registrar targets of student or registrar roles; the normal registrar navigation still exposes student management rather than a registrar account-management page.

## 2.4 Student responsibility

The student completes setup, protects account access, reviews academic records, uploads the correct current-term clearance, explicitly requests review, reads notices, and follows up with staff. Students cannot select and save their own enrollment subjects, enter grades, approve clearance, or mark a meeting completed.

Sources: S01–S04, S08–S15.

# 3. Shared workspace and everyday controls

## 3.1 Navigation and common layout

The public landing page explains the portal and links to sign-in or the dashboard. It remains public even when the visitor already has a session. The protected workspace uses a sidebar, top bar, breadcrumbs, page title, and detail-page Back controls.

The top bar shows the user's name/role, profile link, notification bell, theme switch, and a mobile sidebar control. The notification badge follows the same server visibility rules as the inbox. Only student recipients have unread counts; counts above 99 display as `99+`.

Light/dark preference is stored in a `theme` cookie for one year. Missing or invalid theme values resolve to light. Theme changes affect presentation, not account permissions or academic state.

## 3.2 Search and filters

Student and staff directories, catalogs, and academic outputs provide search or filter controls appropriate to their records. List filters live in URL query parameters, so returning to a filtered URL reproduces its scope. Applying new search/filter values normally returns a paginated list to its first page.

Shared filters derive their control type from validation schemas. Text filters use contains matching. Boolean and enum filters use explicit choices. Numeric/date filters can expose minimum and maximum bounds; the server rejects a minimum greater than the maximum. Dates are interpreted using Manila calendar-day boundaries, and an end date includes that entire day.

Searchable selectors filter options by name/code. Keyboard navigation and selection are supported. Duplicate subjects already present in a draft are disabled in the selector. Inline create actions, where exposed to authorized administrators, create a catalog record; they do not bypass the surrounding curriculum or enrollment save.

## 3.3 Pagination and empty results

Shared directory/catalog tables use 10 records per page, previous/next buttons, visible page numbers, and a jump-to-page control. Invalid or out-of-range page values are normalized by the relevant loader. Empty results show an explanation and suggest adjusting search or filters.

Notifications use 20 records per page. The masterlist uses 50-row lazy batches rather than the shared 10-row pagination. The storage explorer and private test files use storage continuation tokens with up to 100 entries per list request. CSV exports retrieve the complete matching result rather than only the visible page.

## 3.4 Confirmations, saved state, and errors

Confirmations guard actions such as finalization, dropping, deletion, changing an account email, replacing an edited subject list, and discarding unsaved work. Loading states block duplicate submissions. Successful account/enrollment forms remember that the record was saved, so a later navigation failure does not invite an accidental duplicate save.

An unsaved draft and a saved record are different. Canceling a form discards local edits; it does not remove an account already created before opening its enrollment form. Email delivery is another separate outcome: a saved account or academic change can survive an unsuccessful outgoing email attempt.

Authored client errors explain invalid inputs, forbidden actions, missing records, and stale forms. Unknown/provider/server failures use safe public messages. Diagnostic details remain server-side; storage/email credentials and raw provider errors are not returned as page data.

Sources: S02, S04, S05, S17, S20, S22, S26.

# 4. Invitations, sign-in, password recovery, and two-factor security

## 4.1 Staff-provisioned accounts

Public sign-up is disabled. Staff creates accounts through authorized account screens. New accounts receive a password-setup link rather than a staff-chosen initial password. The backend function called `resendMagicLink` actually requests a password-reset/setup link; it does not implement passwordless sign-in.

Setup and reset links expire after 24 hours. The account email template depends on whether a credential password already exists: new accounts receive setup language, existing password accounts receive reset language. Saved account notifications contain safe prose and never the one-use link or token.

## 4.2 First-login and password-reset procedure

1. Open the invitation's `/first-login` link, or the recovery email's `/reset-password` link.
2. The page requires a reset token in the URL. Missing or expired tokens require a new link through staff resend or Forgot password.
3. Enter a new password with at least eight characters and enter the same confirmation. Authentication enforces its password bounds; the signed-in change-password form explicitly allows 8–128 characters.
4. The server obtains the target user from an unexpired reset-token record. It does not trust a browser-supplied user identity.
5. Authentication consumes the token, saves the new password, and revokes old sessions.
6. The server attempts automatic sign-in. If sign-in fails or two-factor verification is required, the password remains saved and the user is told to sign in normally.
7. After successful sign-in, setup completion requires an actual credential password and sets `setupComplete=true` and `emailVerified=true`.
8. The user opens the dashboard. If setup completion needs retrying, the page retains its signed-in state so it does not reuse a consumed reset token.

The application does not impose a universal setup-complete guard on every protected page. Specific operations enforce setup where needed. For example, staff may create a first enrollment before setup finishes, while grade editing/finalization and student clearance require completed setup.

![Flowchart 3. Setup and recovery share token consumption and password creation. Email failure does not delete a newly created account.](system-guide-assets/03-setup.png)

## 4.3 Normal sign-in and sign-out

The login page accepts email and password. Busy controls prevent duplicate sign-in requests. A successful password response either opens the dashboard or presents the two-factor challenge. A signed-in visitor opening `/login` is redirected to the dashboard.

The two-factor challenge accepts a six-digit authenticator code or a recovery code. The login UI lets the user switch modes or return to sign-in. It uses `trustDevice:false`, so this UI does not establish a trusted-device bypass. Recovery codes are single-use.

The sidebar's Log out action asks for confirmation. Confirming signs out and returns to `/login`; canceling retains the current session. Staff session revocation, email changes, password recovery, and disabling a staff account can also invalidate sessions.

## 4.4 Forgot password

The public Forgot password page validates an email address and requests a reset link. Its generic response protects account privacy and does not prove an account exists or that a provider accepted delivery. Staff-initiated invitations have separate request-scoped delivery tracking and can explicitly report delivery failure.

A consumed token cannot be reused. If changing the password succeeds but automatic sign-in fails, use the new password on the normal login page. Do not repeat the consumed reset URL.

## 4.5 Change password while signed in

All roles can open Settings > Security for their own account. Enter the current password, a new password of 8–128 characters, and a matching confirmation. The application calls authentication with `revokeOtherSessions:true`. Success clears the form and signs out other sessions while preserving the current password-change session as handled by authentication.

## 4.6 Enable and disable two-factor authentication

1. Open Settings > Security and enter the current password to start authenticator setup.
2. The application requests TOTP setup and displays a QR code, optional manual key, and recovery codes.
3. Add the secret to an authenticator app. Save the recovery codes outside the browser session.
4. Select the acknowledgment that recovery codes were saved.
5. Enter a six-digit authenticator code and verify it. Two-factor protection is enabled only after successful verification.
6. The application clears setup secrets from client state and refreshes the account's factor status.
7. Canceling the setup clears the local setup display; it does not complete verification.
8. To disable two-factor authentication, enter the current password and confirm through the disable operation. Account status refreshes after success.

The profile/security page loads only the current user's relevant state. Stored QR secrets, recovery codes, passwords, reset tokens, and environment credentials are intentionally absent from this guide.

![Flowchart 4. Self-service password changes and authenticator setup. Password changes revoke other sessions; factor enablement requires code verification.](system-guide-assets/20-security.png)

Sources: S03, S04, S06.

# 5. Creating, editing, and controlling accounts

## 5.1 Create a student

Administrators and registrars open Students and choose Add Student. The dialog collects personal information and offers immediate enrollment or enrollment later. The default create-and-enroll path opens the enrollment editor after successful account creation.

| Field | Current rule |
| --- | --- |
| First name / last name | Required; trimmed; each 1–100 characters. |
| Middle name | Optional; trimmed; maximum 100; stored as empty text when omitted. |
| Email | Required valid email; trimmed/lowercased; unique across every account role. |
| Address | Required trimmed text; maximum 500 characters. |
| Contact number | Required trimmed text; maximum 30 characters; no country-specific phone pattern. |
| Birth date | Valid calendar date in `YYYY-MM-DD`; cannot be after today's Manila date. |
| Sex | Current stored options are `female` and `male`. |
| Enrollment timing | Create and enroll now, or save the student and enroll later. |

The display name is composed from the nonempty name parts. Program, year level, semester, school year, section, and subject selection are entered during enrollment, not during student-account creation.

The server first validates the actor and duplicate email. Duplicate checks are case-insensitive and identify the existing role in the error. It creates the authentication user, then allocates the student number and personal record in a database transaction.

Student numbers use `MA-YYYYMM-NNNNNN`, for example `MA-202610-000001`. The month/year comes from Asia/Manila. The sequence starts at one each month and supports up to 999999 numbers in that month. Deleting an eligible unfinished student does not roll the sequence back or recycle its number.

If saving the student record fails after authentication-user creation, the server attempts to remove that newly created auth user. If cleanup also fails, staff receives an instruction to contact an administrator before retrying. This prevents treating a partially created account as a clean new attempt.

After the account is saved, the system requests its setup email. A delivery failure preserves the account and returns an explicit invitation-failure result. Staff can resend from the saved account rather than create it again.

## 5.2 Create administrator and registrar accounts

Only administrators can create staff accounts. The Administrators and Registrars screens share an administrator-only account-management interface, with the requested role fixed by the selected screen. Enter first name, optional middle name, last name, and email. The same name rules and globally unique email rule apply.

Staff account creation and invitation delivery are separate. The list refreshes after creation even when email fails. Setup status and access status are displayed separately: the interface's setup/Verified badge reflects `setupComplete`; Enabled/Disabled reflects the banned flag.

Staff lists support search by name, email, or internal account ID, schema-based filters, and 10-record pages. The student-facing student number is a different identifier from the internal user/account ID.

![Flowchart 5. Account creation and account-control actions. Deletion uses stricter eligibility than ordinary editing or session revocation.](system-guide-assets/04-accounts.png)

## 5.3 Edit saved accounts

Administrators may edit administrator and registrar names/emails. Administrators and registrars may edit student names, email, address, contact number, birth date, and sex. Students cannot edit their personal record through the read-only Profile page.

Editors send the original field values with the desired new values. The server re-reads the record inside a transaction and compares the originals. If another operator changed an editable value, the save fails with a stale-data conflict rather than silently overwriting the newer change. Reload the record and reapply the intended correction.

User-name changes and student demographic changes save atomically. The student number remains unchanged. Ordinary name/contact/demographic edits preserve credential data, setup status, and academic history.

Changing an email has additional consequences. The UI requests confirmation; the transaction resets `emailVerified=false`, deletes the account's sessions, and invalidates outstanding setup/reset tokens. It preserves `setupComplete` and does not automatically send a new invitation. The existing password remains the account's password. Staff should use the available resend/reset path when a new link is needed.

![Flowchart 6. Account edits compare original values. Email changes reset verification and invalidate sessions/links while preserving student number, setup completion, and history.](system-guide-assets/29-account-edit.png)

## 5.4 Disable/enable, revoke sessions, and delete

| Action | Effect and eligibility |
| --- | --- |
| Disable staff account | Administrator only; confirms loss of access; bans target, revokes sessions, preserves account and activity. Current admin cannot disable self. No equivalent student-disable control is exposed. |
| Enable staff account | Administrator only; removes ban so normal authentication can resume. It does not recreate a deleted account. |
| Revoke sessions | Admin can target students/registrars/admins; registrar can target students only. Signs target out without changing password, account status, or enrollment history. |
| Delete student | Admin/registrar only while setup is unfinished, current pointer is absent, and no enrollment history exists. Dropped or voided history still prevents deletion. |
| Delete administrator/registrar | Administrator only; permanent removal of access, credentials, sessions, factor data, and reset tokens. Current admin cannot delete self. Academic records and student notifications remain. |

Deletion checks run again inside an immediate transaction. Linked auth data cascades as defined by the database. Academic author references become null when their staff account disappears; retained actor-name/audit snapshots preserve human-readable history where implemented.

Resending setup is an email action, not account recreation. It should follow the saved account's identity and current email. Failed email delivery does not turn an already-created account into an unsaved account.

Sources: S03, S06, S07, S24.

# 6. Administrator operating guide

## 6.1 Initial preparation

1. Sign in using the administrator account provisioned during setup. Set an operational password and configure two-factor authentication.
2. Check Settings > Email before creating real users who need setup invitations.
3. Review programs, subjects, and the supplied sample curricula. Replace sample academic plans with approved institutional plans before operational use.
4. Activate the intended published curriculum for each active program. A program without a usable selected curriculum cannot support ordinary enrollment.
5. Configure Garage storage and Settings > Clearance. Save a blank reference, printed areas, and every required office checkbox/signature region.
6. Create registrar accounts. Confirm invitation delivery outcomes and help them complete setup.
7. Use the dashboard's account/catalog health panels and the role-specific worklists to identify setup or configuration gaps.

## 6.2 Recurring work

An administrator can perform every ordinary registrar workflow. In addition, the administrator maintains account access, creates catalog revisions, configures email/storage/clearance, and handles historical academic exceptions. Opening a dashboard or report is read-only; actual state changes require their dedicated controls.

When a curriculum changes, create a new draft and activate it. Published curricula are not edited in place. When a finalized grade is wrong, reopen the enrollment with a reason, correct and finalize the grades again, then complete any reset clearance requirements. When a staff account should be suspended temporarily, disable it rather than permanently delete it.

## 6.3 Exception ownership

| Situation | Administrator action |
| --- | --- |
| Registrar cannot edit old enrollment | Open historical record as admin; obey grade/lifecycle locks. |
| Finalized grade needs correction | Reopen with reason; review provisional grades; finalize again. |
| Wrong active curriculum | Activate the correct plan; existing enrollment references remain historical. |
| Setup email failed | Check provider settings; resend for the existing account. |
| Student clearance repeatedly fails correct form | Inspect saved template/office boxes and report evidence; correct configuration and ask for fresh submission. |
| Raw clearance file is missing | Inspect Garage and referenced object; restoring/replacing storage is an operational repair, not an automatic database fix. |
| Capacity display is too small | Review physical disk and Garage layout; only confirmed increases are supported by the UI. |
| Staff account must be removed | Check self-protection; confirm permanent delete; academic history remains. |

Sources: S02, S07–S16, S21–S25.

# 7. Registrar operating guide

## 7.1 Student admission and first enrollment

Open Students, search for the person before creating another account, and check matching student number/email where available. Create the personal record or correct existing information. If the invitation fails, retain the saved student and resend later. First enrollment can proceed while the student completes setup.

Open Enroll Student, choose the program, review its selected curriculum, and check the school year, semester, year level, and section. Review each subject and unit count. Add or remove subjects explicitly; changing the displayed term does not silently replace an already-edited list. Confirm and save. Check the separate confirmation-email outcome.

## 7.2 End-of-term academic work

1. Use Dashboard or Students worklist filters to find accounts with unfinished setup and enrollments awaiting grades.
2. Obtain the student's completed account setup before grade editing/finalization.
3. Save draft grades, review all subject outcomes and blanks, and finalize only the saved values intended for release.
4. For failed/INC subjects, use the meeting-request action where appropriate. A sent request alone does not satisfy the failed-grade follow-up gate.
5. Review the Enrollment requests queue after students upload passing clearances and explicitly request review.
6. Inspect the original clearance image and saved findings. Verify valid requests or reject with a useful reason.
7. After the actual meeting, mark follow-up completed. This records staff confirmation; the system does not perform or schedule the meeting.
8. Use Next term worklist and the enrollment editor to create new enrollment records for eligible students.

## 7.3 Cases requiring administrator involvement

Registrars cannot edit historical grades, reopen finalized grades, manage staff accounts, publish curricula, or configure email, clearance forms, or storage. A valid current record can still be blocked by incomplete setup, finalized grades, dropped/voided status, a stale revision, or an active meeting-send claim. Those conditions should be resolved at their responsible workflow instead of bypassed.

Masterlist and report filters use the selected term's historical enrollment assignments. Do not substitute the Students directory's current class display when preparing a past-term roster.

Sources: S07–S20.

# 8. Student operating guide

## 8.1 Before the first enrollment

Contact staff to create the account and provide required personal details. Use the invitation email to choose a password. Students cannot self-register or fill a separate applicant-admission record in the current portal.

After signing in, Dashboard displays student number and current academic information when staff has saved an enrollment. An account with no enrollment shows an appropriate message; staff must create that enrollment. The student does not create the first enrollment by uploading clearance.

## 8.2 Review records and grades

Enrollment displays current and historical terms, subjects, units, status, and released grades. A term filter/search helps inspect history. A draft grade is masked on student-facing server data; it remains Pending until finalization, even if staff has entered a number. Finalized blank grades become INC.

Curriculum shows the published plan linked to the student's current enrollment. It does not switch to a newer plan merely because an administrator activates another curriculum for future enrollments. The subject arrangement can be viewed by year/semester, with counts and unit totals.

COR download is available for the student's own enrolled/completed record with subjects. It does not require grades to have been finalized. Dropped or voided records do not qualify.

![Flowchart 7. Student portal views and actions. Academic state is loaded from the signed-in student's records.](system-guide-assets/17-portal.png)

## 8.3 Clearance and review request

After current grades are finalized, open the clearance area in Enrollment. Use a clear JPEG, PNG, or WebP photo/scan of the correctly completed current-term form. Uploading a PDF is not a supported production submission path. Adjust the four form corners so the server can align the document.

Choose Check and save clearance. A fail or review finding does not save a submission. Correct the form/image or contact staff about configuration and try again. An all-pass result is saved as ready; it is not yet in the staff review queue until the student explicitly requests enrollment.

After requesting, wait for staff review. Rejection displays its reason and requires correction, a new passing upload, and another explicit request. Verification satisfies clearance for the current enrollment. Staff still performs the next enrollment, and failed grades may require a completed Registrar meeting first.

## 8.4 Notifications, meetings, and personal information

Notifications lists events addressed to the student, with unread filters and mark-read controls. Reading a notification does not finalize grades, complete a meeting, verify clearance, or enroll the student.

Follow the instructions in meeting notices and arrange the actual discussion with staff. Only staff marks the follow-up completed. INC subjects require the appropriate academic requirements; an INC warning is not the same as the mandatory failed-grade meeting gate.

Profile is read-only. Ask authorized staff to correct names/email/personal details. Security permits password changes and two-factor management. A changed account email signs out sessions and invalidates old reset/setup links.

Sources: S04, S06, S10–S16, S18–S21.

# 9. Programs, subjects, and curriculum lifecycle

## 9.1 Program catalog

A program stores a unique code, name, optional description, active/inactive status, and optional selected active curriculum. Code must be trimmed and nonblank; name must have at least two characters. Administrators create/edit/delete programs; registrars view them.

An inactive program is unavailable for ordinary new enrollment. Deactivating it preserves existing curricula, enrollment history, and its selected-curriculum reference. Selecting an active curriculum in the program editor uses the same publication/activation rules as the curriculum screen.

Deleting a program is blocked while any curriculum references it. Inactivation is the appropriate catalog state when historical dependencies must remain.

## 9.2 Subject catalog

A subject stores a unique code, name, optional description, and active status. Units are not properties of the subject catalog: they belong to the curriculum placement and the actual enrollment attempt.

Administrators create/edit subjects. Catalog renaming does not rewrite previously published curriculum subject snapshots or existing enrollment subject snapshots. Subject deletion is blocked by curriculum references, and enrollment subject foreign keys also protect referenced subjects. An enrollment selector labels inactive subjects but the current server does not categorically reject them; staff must apply institutional selection policy.

![Flowchart 8. Program and subject maintenance. Historical dependencies protect referenced records from deletion.](system-guide-assets/05-catalog.png)

## 9.3 Create and edit a curriculum draft

1. An administrator opens New Curriculum and chooses its program and a name of at least two characters.
2. Set positive integer year-level and semester counts. Defaults are four years and two semesters.
3. Add subjects and assign each to a year level, semester, and positive whole-number units.
4. A subject may appear only once across the entire curriculum. It cannot be duplicated in another term of the same plan.
5. Every placement must fit the curriculum's declared year/semester bounds.
6. Save the draft. An empty draft is permitted, but it cannot be activated without at least one subject.
7. Continue editing while unpublished and unarchived. The saved row list represents the complete desired curriculum, not a partial patch.

Existing placement IDs must belong to that curriculum and retain their subject identity. To replace a subject placement, remove it and add the new one. Draft saves obtain current catalog names/codes and save all changes transactionally.

## 9.4 Activate and publish

Activation requires an active parent program and at least one valid subject placement overall. It does not require a subject in every declared year/semester. Every placement must have valid positive integer fields within the plan's limits.

On first activation, the system refreshes the subject name/code snapshots from the catalog, stamps publication time, unarchives the selected plan, and points the program to it. A previously selected curriculum is archived. Published placements become read-only, preserving the plan used by historical enrollments.

Future ordinary enrollments use the program's selected usable published curriculum. Existing enrollments continue referencing their saved curriculum. Restoring a dropped enrollment in the same program can use its original published plan even after replacement or archiving.

![Flowchart 9. Drafting, publication, replacement, and preservation of historical curriculum assignments.](system-guide-assets/06-curriculum.png)

## 9.5 Derived curriculum states

| State/action | Behavior |
| --- | --- |
| Draft | Never published and not archived; editable. |
| Active | Published, not archived, and selected by its program. |
| Inactive | Published, unarchived, not currently selected. It remains read-only. |
| Archived | Has an archive timestamp; cannot be the usable selected plan. |
| Deactivate | Clears the program's active-curriculum selection. |
| Archive | Sets archive timestamp and clears selection when necessary. |
| Restore/unarchive | Removes archive timestamp; does not automatically activate or make a published plan editable. |
| Delete | Allowed only when not selected and never referenced by an enrollment, including dropped/voided history. |

The interface's “create a revision” guidance means manually creating another curriculum and activating it. There is no dedicated curriculum-clone or automatic revision-copy command. Published edit routes send the operator back to read-only details. An archived unpublished draft must be restored before editing.

Curriculum details group entries by year/semester in All or Tabbed views and show per-term units, total units, subject counts, and plan metadata.

Sources: S08, S09, S24.

# 10. First enrollment and subject selection

## 10.1 Eligibility and loading

Only administrators and registrars can open the staff enrollment editor. The server requires a real student-role user and a linked student personal record. A current-enrollment pointer must resolve to an enrollment owned by that student; a broken/mismatched link is rejected rather than silently reassigned.

For a first enrollment, defaults are year level 1, semester 1, blank section, and the current Manila calendar year as school-year start. That default is not a configurable institutional academic calendar. Program begins blank unless a valid program query supplies a choice.

Ordinary new enrollment needs an active program with its selected active, published, unarchived curriculum. Missing/inactive program, absent selection, wrong program ownership, or unusable curriculum stops loading with an actionable message. Program changes load that program's curriculum and confirm before discarding changed selections.

## 10.2 What staff can edit

| Editor value/control | Behavior |
| --- | --- |
| Program | Loads allowed curriculum; changed draft requires discard confirmation. |
| School-year start | Positive integer; identifies the first year of the displayed year pair. |
| Year level / semester | Positive integers within selected curriculum limits. Initial defaults are clamped to those limits. |
| Section | Required trimmed text; enrollment can store custom sections. Some student-directory filters expose only A–D. |
| Subject row | Select a catalog subject; duplicate subject IDs forbidden. |
| Units | Finite positive number; enrollment units can be fractional. |
| Remove row | Removes from local draft before save. |
| Use term subjects | Explicitly replaces draft with selected term's plan subjects; confirms replacement if draft changed. |
| Failed / INC list | Displays outstanding latest finalized subject concerns and permits explicit retake insertion. |

Changing year/semester updates the term selection but does not silently replace an existing draft's subjects. Staff decides whether to keep custom rows or use the selected term's prescribed rows. At least one subject is required at enrollment save.

![Flowchart 10. Eligibility, editor preparation, validation, and enrollment persistence. A rejected save retains the draft for correction or reload.](system-guide-assets/07-enroll.png)

## 10.3 Curriculum versus extra subject rows

A selected subject is marked `curriculum` only if it belongs to the selected curriculum in the chosen year and semester. A subject from a different curriculum term is `extra` for this enrollment, even when it exists somewhere else in that same plan.

Curriculum rows use the published curriculum's subject name/code snapshots. Extra rows use current catalog name/code. Both accept staff-specified positive units. The system saves subject attempt snapshots so future catalog edits do not rewrite the enrollment's historical subject labels or units.

## 10.4 Confirmation and transaction

The confirmation summarizes student, term, year, section, and subject count. Current finalized failed/INC results add an acknowledgment warning. Canceling returns to the draft.

The server rechecks role, student ownership, current pointer, curriculum availability/selection, term chronology, subject existence, units, and duplicates when saving. An old open form cannot bypass changed requirements. A database partial unique index prevents two valid attempts for one student in the same school year and semester; dropped/voided attempts do not occupy that unique slot.

The transaction inserts the enrollment with status `enrolled`, inserts its subject snapshots and acting staff attribution, updates the student's current pointer, and records the enrollment notification. The system then attempts a confirmation email outside the transaction.

Failed email does not undo enrollment. The UI reports that separate result and prevents resubmission once saving succeeded, including when follow-up navigation fails. A saved student account remains saved if the operator cancels this separate enrollment editor.

Sources: S07, S10, S18, S24.

# 11. Grade drafts, finalization, and outstanding subjects

## 11.1 Grade meanings

| Saved value and release state | Meaning |
| --- | --- |
| Unfinalized enrollment | Student-facing outcome remains Pending; draft numeric values are masked from students. |
| Finalized numeric 1.00–3.00 | Passed. |
| Finalized numeric above 3.00 through 5.00 | Failed. |
| Finalized null/blank | INC, meaning Incomplete. |
| Dropped/voided attempt | Preserved history; excluded from ordinary outstanding-subject calculations. |

Grades must be finite numeric values from 1 through 5, or null. Numeric display uses two decimals. A draft blank is not yet a released INC. Finalization changes the interpretation of saved nulls without inventing numeric grades.

## 11.2 Permission and edit procedure

Grade editing and finalization require completed student account setup, an enrollment that is neither dropped nor voided, and unfinalized grades. Administrators may act on current or historical records. Registrars may act on the current record only.

1. Open the student's enrollment details and inspect current/historical status and lock explanations.
2. Choose Edit Grades. This creates a local draft rather than changing the database immediately.
3. Enter grades or leave null values. Review subject IDs/names to ensure results attach to the correct attempt.
4. Save the changed rows. Cancel restores the saved values, with discard confirmation when necessary.
5. The server checks every subject row belongs to this enrollment, rejects duplicate row IDs, validates values, and compares each original grade with the database.
6. Revision checks reject concurrent lifecycle changes. All grade updates save together or roll back on conflict.

Saving a grade draft increments enrollment revision but does not publish the grades. If another operator changed a grade or the enrollment state, reload and review before retrying rather than overwriting the new values.

## 11.3 Finalize and release

The operator must finish or cancel active edits before finalization. The subject list must be nonempty, saved grades valid, and the confirmation's reviewed values must match the database's complete subject/grade set. Finalization does not silently save an unsaved draft.

The confirmation identifies blank grades that will be released as INC and explains that corrections need administrator reopening. The server compares the exact reviewed subject IDs/grades, sets `finalizedGrades=true`, increments revision, and records the release notification. Status is completed if clearance was already verified; otherwise it remains enrolled. The current clearance workflow normally verifies only after finalization.

After commit, the system attempts the grade-release email. Failure does not unfinalize grades or remove the saved notification. Students can then see the released numeric grades and INC results.

![Flowchart 11. Grade entry and release. Finalization locks the reviewed saved values and exposes them to the student.](system-guide-assets/09-grades.png)

## 11.4 Outstanding failed and INC subjects

The enrollment editor collects finalized non-dropped/non-voided history and determines the latest finalized attempt for each subject ID. Sorting uses school year, semester, enrolled timestamp, and ID in descending order. A more recent passing finalized attempt clears an older failed/INC concern for that subject. A latest failed grade or null remains outstanding.

This is a cross-term list, not merely the previous enrollment's failures. Staff can inspect the subject, prior term, result, and units, then add one or all outstanding subjects to the draft. Duplicate selections are skipped. Matching selected-term curriculum units take priority; otherwise the prior attempt's units are used. Staff may still edit units or remove the added row before saving.

Retakes are never inserted automatically. The current enrollment's finalized failed/INC results separately drive the confirmation warning and the failed-grade follow-up gate. Completing a meeting does not change the subject grade or remove an outstanding failure.

![Flowchart 12. Latest-attempt concern calculation and explicit retake selection. Only a later finalized passing attempt clears an older concern.](system-guide-assets/08-retakes.png)

Sources: S10, S11, S24.

# 12. Administrator clearance-template configuration

## 12.1 What configuration controls

Settings > Clearance is administrator-only. It defines the current blank reference image, form border, printed template areas, configurable office rows, and personal-writing regions for student name/number verification. Production office names are configurable; the five hard-coded departments in the diagnostic prototype are not the production office list.

Storage must be available before saving reference objects. The global template is a singleton with a UUID revision. Replacing the reference or saving its definition creates a new revision, enabling stale-form checks during later student upload/request actions.

## 12.2 Blank reference upload

Upload a nonempty JPEG, PNG, or WebP blank form of at most 10 MiB. The server validates the supported file signature, saves a uniquely named Garage object, and checks the expected existing template revision before replacing the singleton metadata.

A replacement reference resets the definition to null, because old coordinates cannot be assumed correct for a different image. The previous reference object is removed best effort only after the new save succeeds. Cleanup warnings report leftover old objects without pretending the replacement failed. A staging object is cleaned if saving fails and it is safe to establish that no record references it.

## 12.3 Four setup steps

1. **Outline:** inspect detected form borders or manually define the four corners. Confirm that the reference is aligned to the intended form rather than the page background.
2. **Printed areas:** inspect automatic suggestions, add/edit/remove regions manually, assign their kinds, and supply required expected text where appropriate.
3. **Offices and signatures:** define each office's name region, Cleared checkbox region, and signature/stamp region. Suggestions are editable starting points, not approval evidence.
4. **Personal inputs:** mark student name and student number writing areas, including a printed student-number prefix where present. Both are required for student uploads. Course, year and section mappings remain optional and are not verified.

The final save validates all steps and stores the definition together with a fresh revision. The test uses saved settings, not unsaved coordinate changes.

## 12.4 Printed-area and office validation

| Configuration | Rule |
| --- | --- |
| Printed areas | 5–20 areas, unique UUIDs and labels, all inside the aligned form. |
| Required area mix | At least two text areas, exactly one semester area, and exactly one academic-year area. Image/logo/structure areas are optional. |
| Text expectations | Text areas require nonempty expected text. Semester/year expectations come from the actual enrollment/test values. |
| Region size | Each box width and height must be at least 1.5% of the normalized form. |
| Office list | At most 30 offices, unique IDs and case-insensitive names. At least one fully configured office is required for production uploads. |
| Office boxes | Name box required by definition; production upload additionally requires both Cleared checkbox and signature/stamp boxes for every office. |
| Personal regions | At most five; supported kinds include student name/number, course/year/section or combined course-year-section. Duplicate/conflicting kinds are rejected. |

Current production definitions contain no Not Cleared checkbox region. The production checker therefore cannot use the diagnostic prototype's separate Not Cleared rule. Staff must inspect the original document for contradictory marks or other approval problems.

![Flowchart 13. Administrator setup saves a blank reference first, then saves the outline and regions as one validated definition.](system-guide-assets/10-clearance-setup.png)

## 12.5 Browser test and revision consequences

The administrator test accepts an independent expected semester/school year and a filled sample JPEG/PNG/WebP up to 15 MB. The sample stays in the browser. This test checks configured printed/image anchors; it does not execute the full production office-mark checker, replace the reference, create a submission, or approve an enrollment.

If template settings change after a student saves a ready submission, that student cannot request against the obsolete revision and must re-upload. Already-requested submissions are reviewed against their saved definition/report snapshot; verification does not silently recompare them against the latest global reference.

Sources: S12–S15, S22.

# 13. Production clearance submission, OCR, and review

## 13.1 Who can upload and when

Only the student uploads their own current enrollment's clearance through Enrollment. The server requires completed setup, finalized grades, current ownership, and status neither dropped nor voided. Upload is unavailable after verification and while a current-version request awaits review. The implementation allows replacement of obsolete office-check-version requests and unverified submissions without personal checks so those records can obtain current findings. Existing verified staff approvals remain valid.

The document must certify the current enrollment's semester and school-year pair, not the upcoming enrollment's term. A new photo of a correct old term does not satisfy a different current term.

## 13.2 Student upload sequence

1. Choose a nonempty JPEG, PNG, or WebP image no larger than 10 MiB.
2. The browser decodes it, tries to find the border, and offers adjustable corners. If detection fails, draw/adjust the outline manually.
3. Ensure all four corners follow the form's actual border in the correct order. Submit Check and save clearance.
4. The browser sends the original file, normalized corners, enrollment ID/revision, and current template revision. It does not submit trusted approval findings.
5. The server rechecks ownership, eligibility, storage, template definition, office setup, student name/number mappings, and revisions.
6. It independently decodes and analyzes the original image against the saved reference. After template and office checks pass, saved personal areas are sampled and sent to Gemini for transcription; the server compares them with the authenticated student record.
7. Any fail or review result returns findings with no saved submission. Improve the image/form or ask staff to correct configuration, then retry.
8. An all-pass result saves the image and report as ready. The student must still press the explicit request action.

![Flowchart 14. Production upload validates and analyzes original bytes on the server. Review/fail findings remain unsaved; all-pass becomes ready.](system-guide-assets/11-clearance-scan.png)

## 13.3 Image preparation and printed-template checks

The server verifies actual decoded format matches the declared supported MIME. It accepts a single image page with a maximum of 40 million input pixels, applies orientation, flattens onto white, converts to grayscale, and resizes within 2400 by 2400 without enlargement. The processed image must be at least 500 by 400.

Four normalized corners must be finite, lie within the image, form a clockwise convex outline, and cover more than 5% of its normalized area. Degenerate or overlapping geometry is rejected. Reference and submission are perspective-rectified to the reference form's aspect ratio, with maximum normalized dimension 1800.

The process permits one production OCR check at a time per server process. A concurrent attempt receives a busy response rather than starting another expensive worker. The English Tesseract worker uses locally installed language data and a 120-second timeout; worker and busy lock are released afterward.

Each saved printed area is evaluated. Logo/structure areas are optional; templates require school/form text and semester/year areas. Text regions use OCR and normalization; image/structure regions compare aligned black-and-white patches. Semester/year regions derive expected values from the current enrollment instead of copying the blank form's printed example term.

| Printed check | Decision rule |
| --- | --- |
| OCR empty/unreadable or confidence below 65 | Review. It cannot support automatic passing submission. |
| Ordinary text | Search expected normalized wording near its saved box, allowing 5% form width and 3.5% form height margin. Ignore extra nearby labels; distant text cannot match. |
| Semester | Recognize the relevant positive ordinal/semester representation and compare to current enrollment. |
| Academic year | Extract the `20xx–20xx` pair and compare to current school-year start and start+1. |
| Image/structure comparison | Normalized correlation across small local scale/translation variations. Black-and-white shape correlation of at least 0.65 passes; below 0.45 fails; middle range reviews. |
| Empty/insufficient-detail image region | Review; two blank image regions do not establish a match. |

Office checks run only after all template checks pass. A template mismatch cannot be overcome by dark marks in the office boxes.

## 13.4 Office-mark checks

The current report has office-check version 2 and two checks per configured office: Cleared checkbox and signature/stamp. Identity starts unchecked during template/office analysis, then stores a match/review/mismatch result from the personal-information check before successful persistence.

The checker uses adaptive thresholding and subtracts dilated printed-reference ink. It attempts to distinguish new handwriting/marks from the printed checkbox frame or printed signature line. Incorrect reference boxes can therefore produce review findings even with a visually marked form.

| Office check | Current implementation |
| --- | --- |
| Checkbox alignment | Fit four nearby printed edges with local translation up to 45% of box size and edge slopes up to 0.24. Intersect edges to adjust corners, then deskew the interior. Require at least 80% full-edge and endpoint coverage, 60–140% saved side lengths, and a usable interior. Neighboring office centers bound selection; missing frames require review. |
| Blank checkbox reference | More than 1% interior ink reviews and asks for reference correction. A prechecked reference is not treated as blank. |
| Cleared mark pass | Added ink at least 1.2%, plus a connected component of at least six pixels spanning at least eight pixels in the normalized 32×32 interior patch. |
| Weak checkbox marks | Positive but too small/isolated marks review; no added ink fails. |
| Signature/stamp | Added ink ratio at least 0.004 passes; strictly above one third of 0.004 but below 0.004 reviews; at or below one third of 0.004 fails. |
| Overall result | Any fail makes fail; otherwise any review/empty check list makes review; otherwise pass. Saving requires template pass, offices pass, and version 2. |

Office checks measure additional ink and template similarity. They do not establish signature authenticity or real office authorization. Production first compares both configured personal writing areas with the aligned blank reference, excluding printed glyphs, MA-, underlines and specks. Empty or insufficient writing fails before sending crops to Gemini or saving the file. Presence detects added strokes, not readable text or authentic identity. Existing unverified uploads without this check require reupload; previously verified approvals remain valid. Only after both areas pass does production send the configured name/number crops to Google Gemini 2.5 Flash. Expected identity stays outside the prompt. An exact student number without a conflicting name can match. Close numbers, unreadable details or model warnings can be saved as Needs review and submitted for manual identity verification after template and office checks pass; identity mismatches remain blocked. Staff must explicitly confirm that the name and student number match the original clearance and student record before verifying a Needs review submission. The server enforces this acknowledgment. Staff can request another upload with a correction reason instead. Enrollment stays blocked until verification; reviewer identity and time are retained with the original automated findings.

![Flowchart 15. Production template matching and office-mark analysis. Automated passing findings do not replace human review.](system-guide-assets/27-ocr.png)

## 13.5 Persistence, replacement, and conflict handling

Passing images are stored in Garage under a unique `student-clearances/{studentId}/{uuid}/{safeName}` key. SQLite stores filename/type/size, template revision, definition snapshot, selected corners, full report, state, and timestamps. One unique submission exists per enrollment; replacing it replaces the row rather than appending an attempt-history table.

After OCR and object upload, an immediate transaction rechecks the current enrollment/template revisions and the previous submission's identity/state. If the form became stale during analysis, saving fails with a conflict. The server cleans an unreferenced staging object where safe; it never deletes an existing referenced file when commit outcome is uncertain.

On successful replacement, the old object is deleted best effort. Request/review/rejection fields reset for the new ready submission. Storage cleanup is separate from approval state and can leave an orphan object if deletion fails.

## 13.6 Explicit request and staff queue

The student request action runs separately from upload. It requires the student's eligible current enrollment, a ready all-pass submission, no verified clearance flag, and the same current template revision. It sets `status=requested` and `requestedAt`.

Enrollment requests is an administrator/registrar queue of requested and verified submissions for students' current non-dropped/non-voided enrollments. Verified rows remain visible while that enrollment remains current. After staff creates the next enrollment, the old verified row no longer meets that current-pointer queue scope.

Choose Review request to open the staff enrollment details. The review panel shows the original image, filename, saved template/office findings, and review details. Staff must review the document itself, including identity and approval validity that automation does not establish.

## 13.7 Verify or reject

Verification requires the exact requested submission, populated request timestamp, saved all-pass report, finalized grades, current enrollment, matching enrollment revision, and no dropped/voided/already-verified state. Success sets submission verified with reviewer ID/name/time, clears rejection reason, sets enrollment `submittedClearance=true`, sets status completed, and increments revision.

Rejection requires the exact current requested submission and a trimmed reason of 5–1000 characters. It saves rejected status, reviewer information, and reason, and increments enrollment revision. The student sees the reason, corrects the form, uploads a new passing image, and explicitly requests again.

The original file endpoint checks role and ownership. Students can retrieve only their own linked enrollment's submission; staff can review submissions through authorized academic access. Responses use private no-store behavior rather than making clearance files public.

![Flowchart 16. Ready submissions become requests only after the student acts. Staff verification completes clearance; rejection starts a corrected upload/request cycle.](system-guide-assets/12-clearance-request.png)

## 13.8 Submission state reference

| State | Meaning and next step |
| --- | --- |
| No submission | No passing image has been saved for this enrollment. |
| ready | Passed server analysis and saved; student can replace it or request review. |
| requested | Student submitted the ready document to staff review. Current-version upload replacement is locked while waiting. |
| verified | Staff approved the requested document; enrollment clearance flag is true. |
| rejected | Staff rejected with a reason; student must provide a fresh passing image and request again. |
| invalidated | A lifecycle action such as drop/reopen invalidated prior approval evidence. Eligibility must be restored before a fresh upload. |

Dropping and reopening explicitly invalidate submission state. Enrollment correction resets the enrollment's clearance flag but does not itself rewrite the submission state; subsequent eligibility checks still protect ordinary progression. An obsolete template blocks a ready request, while already-requested verification uses its saved snapshot.

![Flowchart 17. Clearance state progression. Rejected submissions return to ready only through a new passing upload; invalidated records require restored eligibility.](system-guide-assets/26-clearance-states.png)

Sources: S11–S15, S22, S24.

# 14. Registrar meetings and next-term enrollment

## 14.1 Sending and completing follow-up

Administrators and registrars can request a meeting for a finalized non-dropped/non-voided enrollment with failed or INC grades. Meeting/follow-up commands are not restricted to current-only records in the way registrar grade editing is. Historical unresolved concerns can appear in follow-up worklists.

Sending a meeting request first claims the send with a started timestamp, avoiding an open transaction during email delivery. An active claim prevents duplicate concurrent sends for 15 minutes. After expiration, the attempt can be retried. An already-sent request cannot be sent repeatedly through the same action.

If delivery fails, the matching claim is cleared and no sent timestamp is recorded. If delivery succeeds, the server stores the sent timestamp, clears the claim, increments revision, and records the meeting notification. If state changed after email acceptance, staff is told the email was sent but state needs refresh rather than being told to blindly resend.

After the real Registrar discussion, staff selects Complete follow-up and confirms completion. The server requires finalized grades and a sent meeting request, rejects repeat completion, and stores `followUpCompletedAt`. This does not change failed/INC grades, remove retake concerns, or verify clearance. There is no appointment calendar, scheduled meeting slot, or attendance capture in this workflow.

![Flowchart 18. Meeting requests separate delivery, recorded request, and actual completed follow-up. INC-only follow-up is optional for the next-term gate.](system-guide-assets/13-followup.png)

## 14.2 Exact ordinary reenrollment gate

A subsequent ordinary enrollment requires the prior current record's grades finalized and clearance verified. If that current finalized record contains any failed numeric grade above 3.00, a completed Registrar follow-up is additionally required for both staff roles. Sending the request alone is insufficient.

INC-only results retain the acknowledgment warning but do not force completed follow-up before reenrollment. Historical outstanding concerns can still appear in worklists and retake selection; they are not all converted into the current failed-grade gate.

If an uploaded clearance submission exists for the current enrollment, enrollment save additionally requires it to be verified with a request timestamp. This prevents legacy flags or stale state from bypassing the uploaded-document workflow.

| Current situation | Ordinary next enrollment |
| --- | --- |
| Grades unfinalized | Blocked. |
| Finalized grades, clearance not verified | Blocked. |
| Finalized + verified + no failures | Eligible, subject to normal program/term/subject checks. |
| Finalized + verified + INC only | Eligible with concern acknowledgment; meeting completion not mandatory. |
| Finalized + verified + failures, follow-up not completed | Blocked even if request email was sent. |
| Finalized + verified + failures, follow-up completed | Eligible with concern acknowledgment. Failed subjects remain outstanding until resolved academically. |
| Dropped current enrollment | Separate Enroll again path; completion and meeting gates bypassed, same-term restoration permitted. |

## 14.3 Next-term default algorithm

1. Read the previous enrollment and its own curriculum's semester count, even if the next enrollment will use another program.
2. If previous semester is below that count, default semester to previous+1 and keep school-year start and year level.
3. If previous semester reaches/exceeds that count, default semester to 1, school-year start to previous+1, and year level to previous+1.
4. Carry previous program and section as defaults.
5. Load the selected program's currently usable published curriculum for an ordinary new enrollment.
6. Clamp initial editor year/semester defaults to that selected curriculum's declared bounds.
7. Staff reviews/edits defaults, retakes, subject selection, units, and section, then confirms saving.
8. The server requires a later school-year/semester tuple for ordinary progression and rechecks all eligibility at save.

For a two-semester plan: year 1, semester 1, SY 2026–2027 defaults next to year 1, semester 2, same SY. After semester 2, defaults become year 2, semester 1, SY 2027–2028. The school-year start is not recalculated from today's date for that ordinary rollover.

![Flowchart 19. Ordinary next-term readiness and rollover. Program changes still calculate rollover using the previous curriculum's semester count.](system-guide-assets/14-next-term.png)

## 14.4 Important progression limits

Defaults remain editable; they are not an automatic institution-approved academic plan. There is no graduation/program-completion branch after the final curriculum year. The implementation calculates another year and the editor clamps it to configured bounds. Staff must handle program completion according to institutional process rather than assume the portal graduates a student automatically.

Reenrollment always creates a new enrollment ID and replaces the student's current pointer. It does not overwrite the previous term or copy its grades into the new subject attempts.

Sources: S10, S11, S15, S16.

# 15. Corrections, voiding, reopening, and dropping

## 15.1 Choose the action by meaning

| Action | Intended meaning |
| --- | --- |
| Correct enrollment | Fix incorrect term/class/subject details in a permitted unfinalized enrolled record. |
| Void enrollment | Mark an incorrectly entered enrollment attempt as invalid while preserving evidence. |
| Reopen enrollment | Administrator unlocks a finalized enrolled/completed record for grade review and correction. |
| Drop enrollment | Record an actual withdrawal from the current enrolled term. |

Corrections, voiding, and reopening require a trimmed reason of 5–1000 characters, exact revision, and their role/lifecycle checks. An active meeting email claim blocks these changes for its 15-minute window so an in-progress send cannot race the record transition.

## 15.2 Correct details and subject selection

Administrators may correct current/historical enrolled, unfinalized records; registrars current only. Corrections can change program, school year/semester, year level, section, and the subject set.

The same program preserves the existing curriculum, including its historical published plan, and permits the responsible correction path for an inactive program. A changed program must resolve an appropriate allowed curriculum. The corrected term cannot duplicate another valid attempt or cross earlier/later valid-enrollment chronology.

Matching subject IDs retain their enrollment-subject IDs, draft grades, and original staff attribution. Their snapshot/source/units may update. New subjects receive new rows and acting staff attribution. Removed rows disappear from the active subject list, but the before/after audit retains them and their grades. Removing a numeric graded row requires an additional acknowledgment.

Saving resets the enrollment clearance flag and meeting/follow-up timestamps, increments revision, and writes the audit plus notification in the same transaction. It does not itself update the clearance-submission row's status. Email is attempted afterward.

## 15.3 Void an incorrect attempt

The record must be unfinalized and not already voided. Admin may void current/historical; registrar current only. Subjects and grades remain saved, status becomes voided, and the record stops occupying the valid-term uniqueness slot.

If the voided enrollment was current, the system selects the latest nonvoided enrollment by term/timestamp/ID as the replacement pointer, or null if none exists. A dropped record can become that replacement. Voiding therefore needs careful review of the resulting current academic state.

Reports, masterlists, ordinary current-work views, and outstanding calculations exclude voided attempts where their defined scope requires it. Enrollment history/audit preserves the evidence.

## 15.4 Reopen finalized grades

Only an administrator can reopen. The enrollment must be finalized and have enrolled/completed status. Current and historical records are supported.

Reopening retains saved grades but makes them provisional again. It sets finalization false, status enrolled, clearance false, clears meeting/follow-up timestamps, invalidates uploaded clearance, and increments revision. Student-facing loaders mask those grades until refinalization.

Staff must review and finalize again. Current clearance must then be resubmitted/reverified through the applicable workflow. A reopened historical record is not automatically the student's current enrollment; current-only clearance rules continue to apply.

![Flowchart 20. Correct, void, and reopen each preserve evidence and require current state checks. Reopening is administrator-only.](system-guide-assets/15-corrections.png)

## 15.5 Audit trail

Each correction/void/reopen records actor ID, retained actor name, action, reason, timestamp, and before/after snapshots of the enrollment and subject set. The staff history expands those snapshots for inspection. Student notifications and change emails explain the event and reason.

Deleting the acting staff account does not delete student academic records. Nullable author links can become null, while retained audit names and before/after values preserve relevant evidence. The audit is not a comprehensive log of every draft keystroke or every general user action; it specifically records these enrollment correction actions.

## 15.6 Drop and enroll again

Admin/registrar may drop the current enrollment only while status is enrolled. A finalized but not completed enrollment can still be dropped. A completed or historical record does not expose the same drop path.

After confirmation, the server checks revision and any active meeting-send claim, invalidates clearance, sets status dropped and `droppedAt`, increments revision, and records the notification. It keeps current pointer, subjects, grades, and historical evidence; email follows after commit.

Enroll again restores the same school year, semester, year, program, section, selected subjects, and custom units as defaults. For the same program it may use the original published curriculum even if archived/replaced; the program generally must still be active. This path bypasses the prior completion/meeting gate and permits the same term, but not an earlier term.

Saving creates a new enrollment attempt and changes the current pointer. The dropped attempt remains. Do not use drop to erase an incorrectly entered record; void expresses that different meaning.

![Flowchart 21. Actual withdrawal and same-term reenrollment preserve the old dropped attempt rather than restoring it in place.](system-guide-assets/16-drop.png)

Sources: S10, S11, S16, S24.

# 16. Dashboards and staff worklists

## 16.1 Staff dashboard

Both staff roles see totals and work queues derived from explicit current-enrollment links, excluding voided current rows. Summary metrics include student accounts, current enrolled/completed/dropped counts, no-current-enrollment count, grades awaiting finalization, clearance pending, next-term ready, and unfinished setup.

| Worklist | Selection rule |
| --- | --- |
| Grades | Current enrolled record, grades unfinalized, student setup complete. |
| Clearance | Current enrolled record, grades finalized, clearance flag false. This is broader than the explicit requested-submission queue. |
| Account setup | Student setup incomplete, even without enrollment. |
| Next term | Current completed record with finalized grades, verified clearance, and no unresolved mandatory failed-grade follow-up. |
| Follow-ups | Finalized non-dropped/non-voided terms with failures/INC and no completed follow-up; can include history and already-sent requests. |

Queue counts cover all matching records; previews show six older terms for action. Worklist links open scoped student views rather than changing data automatically.

Other panels show current enrolled students by program, released grade outcomes on current non-dropped terms, six Manila calendar months of newly created nonvoided enrollment records, and six recent nonvoided enrollments. Monthly enrollment activity includes dropped attempts and is not a count of only currently active students.

Administrators additionally see registrar counts/setup gaps, program totals/active programs missing usable curricula, curriculum totals/drafts, and subject totals/active counts. Registrars do not receive that administrator health object.

## 16.2 Student dashboard

The student sees their own current program, year, section, term, status, subject rows, units, and released outcomes, plus five recent notifications and unread count. Draft values are masked server-side, not merely hidden by CSS.

Next-action messages distinguish no enrollment, pending grade release, clearance upload/review, dropped-term reenrollment, unresolved sent meeting requests, INC requirements, and failed-grade Registrar advice. Historical unresolved follow-ups and dropped-history notices can remain relevant after another enrollment. Counts do not treat provisional grades as released passes/failures.

The dashboard is informational. It does not release grades, send meeting emails, verify a clearance, or create another enrollment merely because a card displays a ready/pending state.

Sources: S17, S18, S24.

# 17. Masterlist and academic reports

## 17.1 Masterlist scope and loading

Administrators/registrars choose school year, semester, program, optional year level, and section. The page defaults to the most recent eligible stored year/semester; with no records its fallback uses the runtime current year and semester 1. Program is searchable. Sections include A–D plus stored custom sections. Invalid values are rejected on the server.

Masterlist includes enrolled/completed records only. Dropped and voided attempts are excluded. A selected historical term uses that enrollment's program/year/section, independently of the student's current pointer. Names/email come from the current user record, so later personal-name corrections can appear in historical-term output.

Rows sort by surname, given name, middle name, then student number. The table starts with 50 rows and loads more using an intersection observer, with Load more/Retry fallback controls. Rows are deduplicated by identity and obsolete requests are canceled when the table scope is torn down.

## 17.2 Masterlist CSV

Export checks staff permissions again and exports all matching rows, not the loaded batches. It includes a title line such as `BSIS 2A ENROLLEES - SEMESTER 1 SY 2026-2027`, a blank line, and these columns: No., Student ID, Surname, Given Name, Middle Name. It is not an export of every visible contact/class column.

Filename uses `masterlist-{start}-{end}-semester-{n}.csv`. Export is disabled while filters are pending/failed to avoid downloading the wrong scope. JSON and CSV responses are private/no-store.

## 17.3 Reports and inclusion rules

Reports is a separate read-only staff screen with report type, school year, semester, optional program, year level, and section. Changing filters automatically refreshes results; rapid changes are grouped. Failed refresh offers Retry, and export/print wait until the generated scope is current.

All report/filter-option queries exclude voided enrollments. Defaults use the latest nonvoided term or current Manila year when empty. Selected academic values come from the term record, while names come from current user records.

| Report | Contents and interpretation |
| --- | --- |
| Enrollment summary | Groups program/year/section. Shows enrolled, completed, dropped, enrollment-record totals, and distinct students. Includes dropped attempts. Record counts and person counts can differ. |
| Grade report | One subject attempt per row: student, class, code/name, units, grade, outcome, release state. Excludes dropped. Draft outcome remains Pending; finalized null is INC. |
| Students needing attention | Student/class plus failure/INC counts, follow-up state, and reasons. Includes unfinalized grades, failures, INC, pending follow-up, or unverified clearance. Excludes dropped. |
| Enrollment completion | Finalization, clearance, follow-up, and next-term state. Historical records are labeled Historical enrollment instead of being presented as current readiness. |
| Dropped enrollments | Dropped attempts with dropped timestamp or Not recorded and current/historical indicator. |

Follow-up labels are Completed when completed timestamp exists; otherwise Requested/Not requested for finalized concerns, or Not required without concerns. Only failed grades make completed follow-up a mandatory next-term gate. INC alone can still appear as a follow-up concern.

Overview cards count the full filtered scope's distinct students and enrolled/completed/dropped records. A report table that excludes dropped rows can therefore differ from the scope's summary cards without indicating a data error.

![Flowchart 22. Selected historical scope feeds read-only masterlist/report queries and full-result exports. Printing carries scope/time metadata.](system-guide-assets/18-reporting.png)

## 17.4 Report exports and printing

Download CSV includes all generated matching rows and column headers. Filename uses `{kind}-{start}-{end}-semester-{n}.csv`. CSV output has a UTF-8 BOM, quoted cells, doubled internal quotes, CRLF row endings, and spreadsheet formula protection for dangerous leading characters.

Print / PDF invokes browser printing of the complete generated report, with selected scope and a Manila timestamp. Workspace controls are hidden. The user can choose Save as PDF in the print dialog. This is distinct from the dedicated server-generated COR PDF; there is no separate server report-PDF endpoint.

Generating, exporting, or printing reports does not modify academic records. Page/download endpoints enforce role checks even when a user attempts their URLs directly.

Sources: S19, S20, S26.

# 18. Notifications and outgoing email

## 18.1 Saved event types

The system records account setup, password reset, enrollment confirmation, grade finalization, meeting request, enrollment dropped, enrollment corrected, enrollment voided, and enrollment reopened events. The notification record stores recipient, optional actor, optional enrollment, event type, safe title/message, creation time, and read time.

Most academic actions write the notification in the same transaction as the state change, then attempt email after commit. A meeting request is different: its event and sent timestamp are recorded after the email send succeeds. Account notices contain safe setup/reset language rather than one-time links or tokens.

Clearance request/review states are displayed by their queue and enrollment workflow; the current event-type list does not define a separate clearance-request/verification email notification type. Opening Notifications does not manufacture those events or backfill older academic history.

## 18.2 Visibility and read controls

| Viewer | Events visible | Read/unread behavior |
| --- | --- | --- |
| Student | Only records whose recipient is that student's user ID. | Own unread count, unread filter, mark one read, mark all own unread read. |
| Registrar | Only records whose actor ID is the current registrar. | Activity view; no recipient unread count or mark-read controls. |
| Administrator | All recorded events. | Activity view; no student inbox read mutation. |

The inbox searches title, message, and recipient name and filters by event type. Student views additionally offer all/unread. Results use 20-record pages ordered newest timestamp then ID. Marking one inaccessible notification returns not found; mark all applies only to the current student's unread addressed events. Existing read timestamps are preserved.

A registrar can see an event they caused even if its email failed, because visibility follows actor attribution rather than delivery. Students see their saved addressed events independently of inbox delivery. Unknown roles are rejected.

![Flowchart 23. Persisted events remain visible when mail fails. Visibility depends on recipient/actor/role, not the email provider's delivery result.](system-guide-assets/19-messaging.png)

## 18.3 Email configuration

Only administrators can open Settings > Email. Settings are stored in singleton row 1. Loaders return the nonsecret settings and booleans indicating whether SMTP password/Resend key exists; they never return saved secret values to the form.

Choose SMTP or Resend. Both require a valid sender email and nonempty sender name without newline characters. SMTP additionally needs a host without whitespace/slash/colon, an integer port from 1 through 65535, and a new or already-saved password. Resend needs a new or already-saved API key.

Blank secret inputs preserve previously saved secrets. Switching providers retains the other provider's saved secret. There is no explicit clear-secret operation in this form. Save commits settings; Cancel restores the last loaded/saved form values. Saving configuration does not send a test message.

The UI includes provider guidance such as Resend verified domain/subdomain requirements and Gmail application-password use. These are configuration help text; the actual sender must match the institution's configured provider account.

![Flowchart 24. Provider configuration and later email acceptance. Print/report timestamps are unrelated to provider delivery state.](system-guide-assets/28-email-settings.png)

## 18.4 Delivery behavior and failure interpretation

Every email loads the current saved provider settings. SMTP authenticates using sender email/password, uses secure mode at port 465, requires TLS, and treats a nonempty accepted-recipient result as send success. Resend requires a response without API error and with a returned message ID.

Templates produce HTML and plain text. Lifecycle messages contain relevant student/term/program context and portal links; correction/void/reopen messages include the reason. Setup/reset links are one-use and expire after 24 hours. Email-generated safe notifications omit those secret links.

Provider request success does not prove the recipient received or read the email. An academic save and an email send are not one distributed transaction. Staff should read the separate success/failure message and resend through the correct account or follow-up path where supported, without recreating academic records.

Sources: S06, S11, S16, S21, S23.

# 19. Certificate of Registration (COR)

## 19.1 Eligibility and download

Administrators/registrars may download a qualifying student's enrollment COR. Students may download only their own. The server checks ownership before reporting status details, preventing another student from probing an enrollment ID for private information.

The enrollment must have status enrolled or completed and at least one subject. Grade finalization is not required. Dropped/voided records are rejected. The endpoint is `/user/enrollment/{enrollmentId}/cor`, even when staff follows a download button from a student detail page.

The server reads the enrollment and subject snapshots consistently within a transaction. Subjects sort by saved code/ID. It uses saved subject labels/units but current student demographic and program-name records. The certificate does not publish grades.

![Flowchart 25. COR generation validates ownership and enrollment status before producing a private PDF attachment.](system-guide-assets/25-cor.png)

## 19.2 PDF contents

The Letter-size PDF identifies Bulacan Polytechnic College, Malolos Campus, school year/semester, student number/name, course-year-section, program, sex, birth date, address, email, contact number, enrollment status, and campus. It lists subject code, title, units, and total units, plus the implemented funding notice, Manila generation timestamp, and page counts.

Long values wrap and paginate; table headings repeat as needed. The attachment filename follows `COR-{studentId}-{schoolYearStart}-semester-{semester}.pdf`. Responses are private/no-store and include no-sniff behavior. Saving the PDF locally does not change the enrollment.

Repository example PDFs demonstrate rendering, not real student approval or a live certificate registry. This COR download is different from Reports > Print / PDF, which uses browser printing rather than the dedicated certificate generator.

Sources: S10, S20, S27.

# 20. Storage administration and private files

## 20.1 Storage purpose and separation

SQLite stores structured records, references, states, reports, and revisions. Garage stores original/reference file bytes in S3-compatible bucket `bpc`. A successful database backup alone does not contain those images; a storage-only backup lacks the relationships and review state.

Production clearance references and student images use their production prefixes, distinct from diagnostic per-user file prefixes. Administrator explorer uploads can target any browsed folder, including those production prefixes; no separate enforced administrator-upload prefix exists. Access remains mediated by the corresponding server endpoint and permissions.

## 20.2 Startup provisioning

When both Garage admin endpoint and token are absent, initialization skips Garage setup. Partially supplied configuration or operational failure causes initialization to fail with a safe error. Builds do not contact Garage.

Configured admin startup ensures a usable cluster layout and finds/creates `bpc`. When `GARAGE_API_ENDPOINT` is also set, it obtains an active app S3 key and grants bucket read/write without owner permission. It records key identity/stable name privately and holds the S3 secret in server memory rather than returning it to browsers or storing that secret in SQLite.

A fresh supported single-node layout gets decimal 10 GB placement capacity in zone `dc1`, with a bootstrap tag and layout version 1. Existing initialized layouts keep their configuration. Multiple nodes, unrelated staged changes, or unsuitable fresh state require manual Garage administration. Automatic bootstrap does not create hardware or reserve disk space.

A database lease per normalized endpoint serializes provisioning/capacity work across app processes. It uses a 120-second lease, a bounded acquisition deadline, ownership assertions, and final release. Partially completed setup can resume without intentionally replacing an already created key.

![Flowchart 26. Garage startup and file access. Administrator explorer operates across the bucket; ordinary test downloads are scoped to the signed-in user.](system-guide-assets/21-storage.png)

## 20.3 Administrator storage explorer

Settings > Storage is administrator-only. Overview and object listing load independently, allowing one panel to report an error while the other remains usable.

The overview displays cluster health, online storage nodes, quorum/partition information, layout version/staged changes, available/object/metadata bytes, bucket usage/quotas, website setting, unfinished uploads, and node capacity/filesystem/zone/tags/version/online/draining state where reported.

The explorer lists folders by object prefix with breadcrumbs and continuation paging. Paths must stay within valid S3 keys: no leading absolute slash, dot traversal, or control characters, and at most 1024 UTF-8 bytes. List requests use up to 100 entries.

Uploads allow arbitrary files up to 10 MiB. Filenames are sanitized and UUID-prefixed to prevent overwrite. General explorer/test uploads use octet-stream content type. Downloads stream through the server as attachments with safe UTF-8 filenames, private no-store, and no-sniff headers.

Deletion requires administrator role and explicit permanent-deletion confirmation. A file or folder must be an immediate child of the currently browsed prefix. Folder deletion recursively lists and deletes objects in batches, validating returned prefixes and advancing continuation tokens. Partial failure is possible and reported so remaining objects can be inspected/retried.

> The raw explorer does not protect objects merely because a clearance/template database row references them. Deleting a live reference image can leave a broken file link. Treat raw deletion as storage administration, and avoid uploads into a prefix while deleting it.

## 20.4 Increase node placement capacity

Only increases are supported. Select an online storage node, enter a larger decimal-GB capacity, and confirm. The server validates node ID, safe byte conversion, current layout version, absence of staged changes, and complete zone/tags. It rejects offline/draining nodes, stale layout, decreases, and values beyond reported filesystem size.

Under the database lease, it stages only that role's capacity change while preserving zone/tags, validates the pending layout twice, applies the next version, and confirms the resulting layout exactly. If the apply response is lost, it rereads Garage to determine whether the change committed. An uncertain result requires refreshing/reviewing pending state, not blindly applying again.

Configured placement capacity does not add physical disk, expand a filesystem, or create a hard disk quota. Operators must provision underlying storage separately where required.

![Flowchart 27. Capacity increases validate current layout and physical limits, then stage/apply/verify one coherent change.](system-guide-assets/22-capacity.png)

## 20.5 Diagnostic personal-file area

`/test/files` is a separate authenticated test page for all three account roles. Each user lists/uploads/downloads only their own `test-files/{encodedUserId}/{uuid}/{safeName}` objects, up to 10 MiB each. Repeated filenames do not overwrite old uploads. Listing uses up to 100 entries with continuation tokens.

Download checks the user's exact prefix and rejects traversal. This page is not integrated with production clearance review and has no administrator-style delete control. Missing storage configuration shows a setup message rather than exposing credentials.

Sources: S22, S25, S28.

# 21. Architecture, data ownership, deployment, and safeguards

## 21.1 Application layers

The application uses Svelte/SvelteKit pages and components, TypeScript, server loaders/endpoints, validated remote commands, SQLite through Drizzle/better-sqlite3, Better Auth, Garage S3-compatible storage, SMTP/Resend delivery, Tesseract/Sharp document analysis, and PDFKit certificate generation. Package versions/ranges belong to `package.json` and the lockfile; this guide documents repository behavior rather than promising compatibility with another version.

Browser components own local drafts, confirmation dialogs, display filters, border adjustment, diagnostic image work, and navigation. The server owns authorization, student identity lookup, authoritative validation, transactions, state transitions, production OCR, storage credentials, and email delivery. Browser-supplied role, report, or grade visibility is never the source of authority.

The request hook resolves authentication and fills server locals. Protected routes/loaders and commands use those locals to validate role/ownership. Unknown failures become safe public errors while diagnostic details stay in server logs.

![Flowchart 28. Browser/server responsibilities and authoritative stores. Current handwriting recognition uses Gemini for production and diagnostics; this architecture figure predates that provider change.](system-guide-assets/30-architecture.png)

## 21.2 Main relationships and invariants

| Relationship/invariant | Why it matters |
| --- | --- |
| One student personal row per student user | Prevents multiple student identities for one account. |
| Student has one unique current-enrollment pointer | Current workflow follows explicit ownership rather than latest-date guessing. |
| Enrollment references one student and curriculum | Term registration owns its own academic assignment. |
| Enrollment has many unique subject attempts | One subject ID per enrollment; names/units saved historically. |
| Partial unique student/year/semester index | At most one valid enrolled/completed attempt for a term; dropped/voided attempts exempt. |
| Program selects optional curriculum | New ordinary enrollment needs a usable selected plan. |
| Published curriculum subject snapshots | Later catalog edits do not rewrite plan history. |
| One saved clearance submission per enrollment | Replacement updates evidence rather than retaining a full upload-attempt history. |
| Revision field and original-value comparisons | Stale forms cannot silently overwrite newer grades or lifecycle changes. |
| Restrictive academic foreign keys | Student/curriculum/subject deletion cannot discard referenced academic history. |
| Nullable staff authors plus retained names | Deleting staff access preserves academic evidence. |

Enrollment status is one of enrolled, completed, dropped, voided. Grade finalization, clearance verification, and meeting completion are additional independent facts. A completed term can still be blocked from next enrollment by failed-grade follow-up; status alone is insufficient.

Database rows also include auth sessions/accounts/reset verification records/two-factor data, notification recipient and actor links, system settings, monthly student sequences, private Garage provisioning metadata, and correction audit snapshots. The `task` table is present but does not have a documented active enrollment feature in the current routes.

## 21.3 Transaction boundaries and concurrency

Account personal edits compare original field snapshots and save linked rows atomically. Student number allocation increments within a transaction. Enrollment creation inserts the enrollment and all subjects plus current pointer together. Grade saves compare original grades, while finalization compares the complete reviewed set. Correction/void/reopen use revision plus lifecycle checks and save before/after audits transactionally.

Expensive external work happens outside long database transactions. Meeting email uses a claim then records acceptance; OCR/image storage is followed by an immediate revision recheck; ordinary academic email follows committed state. These boundaries explain why an email failure does not roll back grades and why a stale OCR analysis may be rejected after processing.

Claims/leases coordinate specific shared operations. They do not create a general background job queue. Email is attempted by the request path, and there is no persistent automatic retry worker described by the current code.

## 21.4 Configuration names

| Setting name | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite database path; required by DB initialization/migration. |
| `ORIGIN` | Public application origin used by authentication and deployment. |
| `BETTER_AUTH_SECRET` | Authentication signing/security secret. |
| `GARAGE_ADMIN_ENDPOINT`, `GARAGE_ADMIN_TOKEN` | Private Garage Admin API configuration. |
| `GARAGE_API_ENDPOINT`, `GARAGE_REGION` | S3-compatible endpoint and matching region. Region fallback is `garage`. |
| `BODY_SIZE_LIMIT` | Node request-body limit; Compose sets `12M` to cover bounded 10 MiB file multipart requests. |
| `GEMINI_API_KEY` | Server-only key for Google Gemini handwriting transcription in production clearance and diagnostics. |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Seed-process inputs for initial administrator creation when running that seed process. |
| Saved email settings | SMTP/Resend sender/provider/secret values are stored privately in system settings, not in page data. |

Actual `.env` values, database credentials, generated account secrets, and object-store tokens were not copied into this guide. Compose currently forwards the declared core/Garage settings and body limit; adding other seed/diagnostic environment inputs requires deployment wiring where they are not already forwarded.

## 21.5 Build and container startup

The project scripts expose development, production build, preview, type checking, lint/format, database migration/generation/studio/seed, and authentication-schema generation. These are maintainer tools, not student operations.

The Docker build uses Node 22 Alpine, installs the pinned package-manager version and dependencies, then builds the Node adapter output. The runtime image carries build output, dependencies, migrations, required seed/schema files, and the entrypoint. Production defaults listen on port 3000 and use `/app/data/local.db`.

Startup prepares the persistent data directory, gives the runtime node user access, applies pending SQL migrations, attempts seeding, and starts the Node application. Migration failure stops startup. Seed failure logs a warning and permits startup, with retry next time. Application initialization then performs configured Garage setup; a required Garage initialization failure can prevent serving requests.

Docker Compose mounts `./data` into `/app/data` and declares restart behavior. The checked workflow builds on pull requests to `main` and publishes `aetherknowledge/enrollment-system` latest/commit tags on `main` pushes or manual execution. Older README wording about another branch/image is not the authoritative workflow.

![Flowchart 29. Build and runtime startup. Database migration is a required gate; seed failures are warned and retried on a later startup.](system-guide-assets/23-runtime.png)

## 21.6 Seed behavior and sample data

The seed process checks singleton `seeded` and skips when already true. It creates/reuses sample programs BSIS, ACT, and DHRMT, twenty sample subjects, and three sample published curricula named 2026 Sample Curriculum. It does not currently create sample student accounts or enrollments. Existing program selections and existing curriculum rows are not overwritten on rerun.

The initial admin uses seed environment inputs when present; the code contains development fallback credentials. Operational deployment should supply controlled values and secure/change the account rather than treat development defaults as institutional policy. The seed marks the selected initial admin as admin/setup complete and then sets seeded true.

## 21.7 Backup and operational preservation

A recoverable operational snapshot needs both SQLite data and Garage objects, plus separately managed configuration/secrets. The portal does not expose a built-in backup/restore screen. This guide does not claim a tested restore for the user's live deployment.

Use a consistent SQLite backup process or stop writes when copying its files; preserve whatever SQLite companion files are required by the chosen mode/process. Preserve Garage data and database-referenced keys together. Schema rollback is not equivalent to restoring deleted file objects or reversing a human-approved academic change.

Sources: S01, S03, S05, S22–S25, S28, S29.

# 22. Diagnostic tools and prototype boundaries

## 22.1 Standalone scan laboratory

`/test` labels itself a standalone prototype with no records changed. Visitors can inspect local/demo/example images, adjust borders, preview aligned form crops, review OCR evidence, and examine mark measurements. Browser OCR may download its language resources on first use. Signed-in visitors additionally receive current saved-template metadata and an identity test target when available.

The prototype has fixed geometry and fixed departments such as SG Adviser, PTCA, Adviser, Research, and Program Head. It can inspect expected personal details and both Cleared and Not Cleared regions. These fixed rules are not the configurable production office rules documented in Chapter 13.

Prototype Not Cleared ink at least 4% fails; contradictory both-checkbox evidence also fails. Low Cleared/signature ratios fail or review according to that prototype's thresholds. Those diagnostic values must not be quoted as the production version-2 checkbox/signature algorithm.

## 22.2 Handwriting identity experiment

The identity UI requires prior template pass and sign-in, crops only name and student-number regions, and submits PNG crops to a same-origin server endpoint. Changing image/corners invalidates earlier evidence. Cancellation is supported.

The server obtains expected identity from the session/database. Student accounts compare their own identity. Staff diagnostic accounts target the fixed test student number `MA-23016578`; if that record does not exist, the endpoint returns no target rather than searching an arbitrary real person.

The JSON body is bounded to 2 MiB and must contain exactly two base64 PNG crops. Each encoded field has a length bound; actual PNG headers and dimensions are checked, with each crop limited to 2400×1000 and two million pixels.

One handwriting request runs per server process. The shared service calls Gemini `generateContent` using `gemini-2.5-flash`, sends both field crops in one request, and requests structured JSON. Calls have a 60-second timeout. Reasoning text is ignored. Incomplete or unusable output produces warnings rather than inferred identity. Authentication keys and provider error details remain server-side.

Normalized comparison handles case, accents, punctuation, and spacing. Exact student-number evidence can pass if the name is not different. Gemini reads the numeric student-number suffix; comparison ignores an optional printed or handwritten `MA-` prefix, including a repeated prefix, while preserving leading zeros and rejecting other letter prefixes. A one-digit-close number or a sufficiently similar name leads to manual review rather than authenticated identity. Model warnings force review. Timeout/cancellation returns 408 and provider failure 502 with safe text.

![Flowchart 30. Diagnostic browser inspection and optional handwriting recognition. These results do not approve a production clearance or modify enrollment records.](system-guide-assets/24-diagnostics.png)

## 22.3 How to interpret diagnostic results

A prototype match means that experiment's expected image/text comparison succeeded. It does not set enrollment clearance true, create a requested submission, verify a signature, or authorize next enrollment. Production uses the same recognition and comparison logic only after its own authenticated template and office checks. A diagnostic result cannot bypass that production pipeline.

`/test/files` similarly exercises authenticated personal file storage, not clearance upload. A successful file upload there does not appear in Enrollment requests.

Sources: S12–S15, S22, S28, S30.

# 23. Worked examples, recovery cases, and implemented limits

## 23.1 New student to second-semester enrollment

1. Registrar creates Maria Santos with valid personal information. The server assigns the current Manila month sequence student number and saves the account.
2. Setup email succeeds. Maria chooses a password and completes setup. If email had failed, the saved account would remain for resend.
3. Registrar selects BSIS, year 1, semester 1, SY 2026–2027, section A, reviews subjects, and saves. The enrollment becomes current.
4. Registrar saves grades. Maria sees Pending until finalization.
5. Registrar finalizes all passing grades. Maria sees the released results and can use the current-term clearance workflow.
6. Maria uploads a properly signed current-term form. All server checks pass, so it becomes ready. Maria explicitly requests review.
7. Registrar inspects the original image and verifies the requested submission. Status becomes completed and clearance true.
8. Registrar opens Next term. Defaults become year 1, semester 2, same school year/program/section. Registrar reviews and saves a new enrollment.
9. First enrollment remains history; current pointer now identifies the new record. The previous verified clearance leaves the current-request queue scope.

## 23.2 Failed subject at year rollover

After year 1 semester 2, a finalized 4.00 grade is failed. Even with verified clearance, ordinary next enrollment stays blocked until Registrar follow-up is completed. Sending a meeting email alone does not clear the block.

Staff sends the request, holds the actual discussion, and marks follow-up completed. Next enrollment then defaults to year 2 semester 1 and school-year start +1. Staff explicitly adds any retake from the outstanding list. The failed grade remains on the old subject attempt and in outstanding concerns until a later finalized pass resolves it.

If the only concern were INC, the meeting-completion gate would not apply, but the editor still requires acknowledgment and the outstanding requirement remains visible.

## 23.3 Incorrect enrollment versus actual withdrawal

If staff entered the wrong enrollment and it is unfinalized, correct its details or void it with a reason. Audit snapshots preserve what changed. If a student actually withdraws, drop the current enrolled term. Enroll again creates another attempt with restored same-term defaults; it does not erase or reactivate the old dropped record in place.

If grades are already finalized, an administrator must reopen before academic correction. Reopening invalidates clearance/follow-up and masks grades until rerelease.

## 23.4 Common blocked actions and resolution

| Symptom | Meaning and next step |
| --- | --- |
| Setup invitation failed | Account may already be saved. Check provider settings and resend for existing account. |
| Duplicate email | Account exists under some role; search/correct that account rather than create another. |
| Grade controls locked | Check setup, current/historical permission, finalized flag, dropped/voided status. |
| Conflict/reload message | Original values/revision changed. Reload and review the current record before retrying. |
| Next term blocked despite completed status | Check failed-grade completed follow-up and any saved uploaded-submission state. |
| OCR busy | Another check runs in that process; retry after it finishes. |
| Clearance shows review | Evidence is insufficient for an automatic pass; improve alignment/image/form or correct administrator region setup. |
| Ready clearance cannot request | Global template revision may have changed; upload against current settings. |
| Requested clearance cannot replace | Current-version request is awaiting staff review; staff must reject when correction is needed. |
| Template/clearance image missing | Stored object may be absent/deleted. Administrator must inspect storage/reference state. |
| Meeting action temporarily blocked | Another send claim is active; refresh and avoid duplicate delivery. Expired claims are retryable after their window. |
| Program unavailable | Check active status and usable selected published curriculum. |
| Curriculum cannot edit/delete | Publication/archive/selection/enrollment references protect historical academic plans. |
| COR unavailable | Check ownership, enrolled/completed status, and nonempty subject list. |
| Storage unavailable | Check configured endpoints, initialization, permissions, and connectivity. |

## 23.5 What current implementation does not provide

The current routes do not provide a separate applicant review pipeline, student self-registration, instructor grade-entry role, cashier/payment/tuition ledger, timetable/room allocation, class seat capacity, automatic prerequisite enforcement, automatic retake insertion, graduation processing, or automatic next-term enrollment. Staff remains responsible for those institutional decisions or external processes.

Clearance does not authenticate signatures. Production uses Gemini transcription to compare handwritten name/number with the student record; this supports staff review and does not prove document authenticity. The system stores one current submission per enrollment, not an append-only archive of every failed scan or upload replacement.

Profile is read-only, while guarded staff account editors are implemented. Two-factor setup/login is implemented. Administrator management is implemented. Do not rely on older notes that describe those latter features as unfinished.

Reports and dashboards describe recorded data and defined inclusion rules; they do not prove email receipt, meeting attendance, office authenticity, or official academic policy. These operational limits should guide staff review without being confused with missing error handling or authorization.

Sources: S01–S30.

# Appendix A. Screen and endpoint reference

Dynamic braces identify a record ID placeholder. Account user IDs and student numbers are distinct identifiers.

| Route or screen | Authorized audience and purpose |
| --- | --- |
| `/` | Public landing page; portal information and dashboard/sign-in link. |
| `/login` | Public login and second-factor/recovery challenge; signed-in users redirected. |
| `/first-login` | Token-based first password setup. |
| `/forgot-password` | Public generic recovery request. |
| `/reset-password` | Token-based password reset and attempted sign-in. |
| `/user` | Protected workspace entry redirect/view leading to dashboard. |
| `/user/dashboard` | Role-specific staff or own-student dashboard. |
| `/user/admins` | Admin-only administrator account management. |
| `/user/registrars` | Admin-only registrar account management. |
| `/user/students` | Staff student directory, create/edit, setup resend, eligible deletion, session revocation. |
| `/user/students/{userId}` | Staff student personal information, current enrollment and history. |
| `/user/students/{userId}/enroll` | Staff first/next/restoration enrollment editor. |
| `/user/students/{userId}/enrollments/{enrollmentId}` | Staff term details, grades, review, lifecycle actions, audit. |
| `/user/students/{userId}/enrollments/{enrollmentId}/edit` | Permitted staff correction editor. |
| `/user/enrollment` | Student own current/history, released grades, clearance upload/request. |
| `/user/enrollment/{enrollmentId}/cor` | Authorized staff or owning student private COR PDF. |
| `/user/clearances` | Staff Enrollment requests review queue. |
| `/user/clearance-template` | Authenticated supported roles fetch current reference, optional revision match. |
| `/user/clearance-files/{id}` | Staff/owner retrieve saved original clearance image. |
| `/user/programs` | Staff catalog; admin writes. |
| `/user/subjects` | Staff catalog; admin writes. |
| `/user/curriculum` | Staff list or student's own assigned curriculum. |
| `/user/curriculum/new` | Admin draft creation. |
| `/user/curriculum/{curriculumId}` | Authorized staff or owning student's published plan detail. |
| `/user/curriculum/{curriculumId}/edit` | Admin unpublished/unarchived draft editing. |
| `/user/masterlist` | Staff selected historical-term roster. |
| `/user/masterlist/rows` | Staff next lazy roster batch. |
| `/user/masterlist/export` | Staff full matching roster CSV. |
| `/user/reports` | Staff five academic report types. |
| `/user/reports/export` | Staff matching report CSV. |
| `/user/notifications` | Role-scoped saved event inbox/activity log. |
| `/user/settings` | Settings entry redirects to an appropriate settings page. |
| `/user/settings/profile` | Own read-only account/personal data. |
| `/user/settings/security` | Own password/TOTP/recovery operations. |
| `/user/settings/email` | Admin provider/sender configuration. |
| `/user/settings/clearance` | Admin reference, region definition, browser test. |
| `/user/settings/storage` | Admin whole-bucket browser, overview, confirmed deletion/capacity. |
| `/user/settings/storage/upload` | Admin bounded multipart file upload. |
| `/user/settings/storage/download` | Admin storage attachment stream. |
| `/test` | Standalone browser scan/diagnostic prototype; optional signed-in tools. |
| `/test/identity` | Authenticated same-origin diagnostic handwriting POST. |
| `/test/files` | Authenticated private per-user test upload/list. |
| `/test/files/download` | Authenticated own-prefix download. |

`/user/applicants` has a remaining layout file but no implemented applicant page in the inspected route inventory. A metadata entry for a route name does not prove an implemented user workflow. Better Auth also handles its authentication API through the server hook; those library endpoints are separate from the application screen list.

# Appendix B. Server command and responsibility index

This inventory groups exported application commands/queries by owner. Direct Better Auth client operations also perform login, password changes, factor management, sign-out, and the staff ban/session APIs described earlier.

| Owner module | Commands and responsibility |
| --- | --- |
| `actions/user.remote.ts` | `createStudent`, `updateStudent`, `deleteStudent`: personal account lifecycle and protected deletion. |
| same | `createRegistrar`, `updateRegistrar`, `deleteRegistrar`, `setRegistrarDisabled`: admin-managed registrar access. |
| same | `createAdmin`, `updateAdmin`, `deleteAdmin`, `setAdminDisabled`: administrator account management with self-protection. |
| same | `revokeAccountSessions`: role-scoped sign-out of target sessions. |
| same | `resendMagicLink`: staff-initiated password-setup/reset invitation, despite historical name. |
| same | `enrollStudent`: validate/save term, subjects, current pointer, notification; attempt email. |
| `actions/password.remote.ts` | `resetPasswordAndSignIn`, `completeFirstLogin`: consume token, set password, attempt sign-in, finish account flags. |
| `actions/enrollment.remote.ts` | `correctEnrollment`, `voidEnrollment`, `reopenEnrollment`: guarded academic changes with reasons/audits. |
| `actions/grades.remote.ts` | `updateEnrollmentGrades`, `finalizeEnrollmentGrades`: drafts and reviewed release. |
| same | `verifyEnrollmentClearance`: approve exact requested image and complete current clearance. |
| same | `sendEnrollmentMeetingRequest`, `completeEnrollmentFollowUp`: delivery claim, sent state, completed discussion. |
| same | `dropEnrollment`: current actual withdrawal and invalidation. |
| `actions/clearance.remote.ts` | `getStudentClearance`, `uploadClearance`, `requestEnrollment`: own current production clearance information, analysis/save, explicit request. |
| same | `rejectClearance`: staff reasoned rejection of requested submission. |
| same | `getClearanceSettings`, `uploadClearanceTemplate`, `saveClearanceAreas`: admin template and saved definition management. |
| `actions/curriculum.remote.ts` | `createCurriculum`, `updateCurriculum`, `activateCurriculum`, `changeCurriculumState`, `deleteCurriculum`: plan lifecycle and publication. |
| `actions/program.remote.ts` | `createProgram`, `updateProgram`, `deleteProgram`, `setProgramStatus`: admin catalog and curriculum selection. |
| `actions/subject.remote.ts` | `createSubject`, `updateSubject`, `deleteSubject`, `setSubjectStatus`: admin subject catalog. |
| `actions/settings.remote.ts` | `updateSystemSettings`: save validated email settings while preserving blank secrets. |
| `actions/notifications.remote.ts` | `readNotifications`: supplied `id` marks that own event; omitted `id` marks all own unread events. |
| `actions/storage.remote.ts` | `deleteGarageEntry`, `increaseGarageCapacity`: administrator-only validated confirmed mutations. |
| `server/enrollment.ts` | Authoritative eligibility, allowed curriculum/subject mapping, outstanding finalized attempts. |
| `server/enrollment-editor.ts` | Enrollment defaults and loading; restoration/ordinary progression. |
| `server/enrollment-corrections.ts` | Revisions, chronological protection, snapshots, correction/void/reopen ownership. |
| `server/student-enrollment.ts` | Grade/lifecycle permissions and student-facing grade masking/history. |
| `server/clearance-workflow.ts` | Own-current eligibility, request state, queue, verification/rejection invariants. |
| `server/clearance-upload.ts` | Server analysis/object save/recheck and safe replacement cleanup. |
| `server/clearance-checker.ts` | Production decoding, rectification, OCR, printed and office findings. |
| `server/masterlist.ts`, `server/reports.ts` | Validated historical scope, data queries, output generation. |
| `server/notifications.ts`, `server/email/*` | Safe persisted events, role visibility, templates, provider delivery. |
| `server/garage/*` | Provisioning lease, layout, S3 operations, explorer, overview/capacity. |

Dedicated catalog status commands exist even where the current interface saves active status through a full edit form. Commands listed here are implementation entry points; ordinary users operate the corresponding UI.

# Appendix C. Data dictionary and state ownership

| Table/record | Important data and ownership |
| --- | --- |
| `user` | Identity, name parts/display name, unique email, role, setup/email flags, ban state, factor flag, timestamps. |
| `student` | Student number primary key, unique user link, address/contact/birth/sex, unique current enrollment, creation time. |
| `student_sequence` | Year/month primary key and last allocated monthly number. |
| `program` | Unique code, name/description, active status, selected curriculum ID. |
| `subject` | Unique catalog code, name/description, active status; no universal unit value. |
| `curriculum` | Program-code link, unique program/name pair, year/semester bounds, publication/archive state. |
| `curriculum_subject` | Unique subject in a curriculum, placement, units, published name/code snapshots. |
| `enrollment` | Student/curriculum, section/year/semester/school-year, status, finalization/clearance, meeting/follow-up/drop times, revision. |
| `enrollment_subject` | Unique subject per enrollment, source curriculum/extra, optional placement link, grade, name/code/units snapshot, staff/time. |
| `enrollment_audit` | Corrected/voided/reopened event, actor ID/name, reason, before/after JSON snapshots, timestamp. |
| `clearance_template` | Singleton 1; revision/object metadata, optional saved definition, uploader/time. |
| `clearance_submission` | Unique enrollment; image metadata, template/definition/corners/report snapshot, state/request/reviewer/rejection. |
| `notification` | Recipient, optional actor/enrollment, event type, safe text, creation/read times. |
| `system_settings` | Singleton 1; seed flag, provider, sender, SMTP settings/password and Resend API key. Secrets are private. |
| `garage_storage` | Endpoint, stable key name/ID, lease token/expiry. S3 secret stays in server memory. |
| `session` | Unique session token, user, expiry, client metadata. Cascades on user removal. |
| `account` | Auth provider account/credential data and hashed password handled by authentication. |
| `verification` | Expiring authentication verification/reset records. |
| `two_factor` | Factor secret, backup-code data, verification/lock bookkeeping. |
| `task` | Existing small task table without an active documented enrollment UI workflow. |

The database and commands apply uniqueness, positive units/placement rules, grade range, status enums, and restrictive/cascading/set-null relationships according to their owners. Validated inputs complement those constraints; UI-only validation is not the enforcement boundary.

# Appendix D. Source map and glossary

Paths are repository-relative. Line references identify representative inspected entry points and may move as code changes.

| ID | Source locations |
| --- | --- |
| S01 | `src/lib/schema.ts:1`, `src/lib/Roles.ts:1`, `src/lib/server/db/index.ts:1`. Core records, roles, database. |
| S02 | `src/lib/components/Sidebar/navigation.ts:39`, `src/routes/user/+layout.server.ts:7`, `src/lib/components/Topbar/Topbar.svelte:1`. Role navigation/workspace. |
| S03 | `src/lib/server/auth.ts:18`, `src/lib/auth-permissions.ts:10`, `src/lib/server/auth-names.ts:22`, `src/hooks.server.ts:12`. Auth boundary/hooks. |
| S04 | `src/routes/login/+page.svelte:16`, `src/routes/first-login/+page.svelte:13`, `src/routes/reset-password/+page.svelte:13`, `src/routes/user/settings/security/+page.svelte:65`. Login/password/TOTP UI. |
| S05 | `src/lib/errors.ts:1`, `src/hooks.client.ts:1`, `src/lib/components/Popup/`, `src/lib/components/ThemeController/`. Safe errors/shared controls/theme. |
| S06 | `src/lib/actions/password.remote.ts:11`, `src/lib/server/email/account-setup.ts:1`, `src/routes/forgot-password/+page.svelte:13`. Tokens/setup/delivery tracking. |
| S07 | `src/lib/actions/user.remote.ts:32`, `src/lib/students.ts:5`, `src/lib/person-name.ts:3`, `src/routes/user/students/StudentDialog.svelte:37`. Account/student lifecycle. |
| S08 | `src/lib/actions/program.remote.ts:12`, `src/lib/actions/subject.remote.ts:11`, `src/routes/user/programs/`, `src/routes/user/subjects/`. Catalogs. |
| S09 | `src/lib/actions/curriculum.remote.ts:12`, `src/lib/server/curriculum.ts:35`, `src/routes/user/curriculum/`. Draft/publication/history. |
| S10 | `src/lib/server/enrollment.ts:24`, `src/lib/server/enrollment-editor.ts:36`, `src/routes/user/students/EnrollmentEditor.svelte:35`. Enrollment/retakes/defaults. |
| S11 | `src/lib/actions/grades.remote.ts:34`, `src/lib/server/student-enrollment.ts:9`, `src/lib/enrollment-grades.ts:3`. Grades/meeting/drop/clearance flags. |
| S12 | `src/lib/actions/clearance.remote.ts:25`, `src/lib/server/clearance-template.ts:34`, `src/routes/user/settings/clearance/`. Admin template definition/setup. |
| S13 | `src/lib/server/clearance-upload.ts:31`, `src/lib/server/clearance-workflow.ts:42`, `src/routes/user/enrollment/StudentClearance.svelte:35`. Production submission/request/review. |
| S14 | `src/lib/server/clearance-checker.ts:29`, `src/lib/clearance/definition.ts:107`, `src/lib/clearance/report.ts:14`, `src/lib/clearance/checkbox.ts:165`. OCR/geometry/mark thresholds. |
| S15 | `src/routes/user/clearances/+page.server.ts:6`, `src/routes/user/students/EnrollmentDetails.svelte:317`, `src/routes/user/clearance-files/[id]/+server.ts:10`. Queue/reviewer/file access. |
| S16 | `src/lib/server/enrollment-corrections.ts:22`, `src/lib/actions/enrollment.remote.ts:1`, `src/routes/user/students/EnrollmentRecordActions.svelte:126`. Changes/audit. |
| S17 | `src/lib/server/staff-dashboard.ts:34`, `src/lib/server/enrollment-worklist.ts:8`, `src/lib/pages/Dashboard/Staff/Dashboard.svelte:133`. Staff metrics/queues. |
| S18 | `src/lib/server/student-dashboard.ts:6`, `src/lib/pages/Dashboard/Student/`, `src/routes/user/enrollment/`, `src/routes/user/settings/profile/`. Own academic views. |
| S19 | `src/lib/server/masterlist.ts:10`, `src/routes/user/masterlist/MasterlistTable.svelte:19`, `src/routes/user/masterlist/export/+server.ts:4`. Masterlist. |
| S20 | `src/lib/server/reports.ts:23`, `src/lib/reports.ts:1`, `src/routes/user/reports/+page.svelte:116`, `src/lib/server/csv.ts:1`. Reports/exports. |
| S21 | `src/lib/server/notifications.ts:12`, `src/lib/actions/notifications.remote.ts:8`, `src/lib/email.ts:6`, `src/routes/user/notifications/`. Events/visibility. |
| S22 | `src/lib/server/garage/index.ts:13`, `src/lib/server/garage/files.ts:39`, `src/lib/server/garage/credentials.ts:15`. Provisioning/files/lease. |
| S23 | `src/lib/server/email/index.ts:10`, `src/lib/server/email/templates.ts:124`, `src/lib/server/settings.ts:5`, `src/lib/actions/settings.remote.ts:12`. Email configuration/delivery. |
| S24 | `src/lib/schema.ts:176`, `src/lib/schema.ts:210`, `src/lib/schema.ts:275`, `src/lib/server/staff-accounts.ts:11`. Persistence/constraints/lists. |
| S25 | `src/lib/server/garage/admin.ts:14`, `src/lib/server/garage/explorer.ts:23`, `src/lib/server/garage/layout.ts:72`, `src/routes/user/settings/storage/`. Storage admin/capacity. |
| S26 | `src/lib/server/filters.ts:20`, `src/lib/components/Filter/fields.ts:18`, `src/lib/components/Table/TableValues.ts:1`. Common filters/pagination. |
| S27 | `src/lib/server/cor.ts:15`, `src/lib/server/cor-pdf.ts:13`, `src/routes/user/enrollment/[enrollmentId]/cor/+server.ts:6`. Certificate output. |
| S28 | `src/routes/test/files/+page.server.ts:12`, `src/lib/server/garage/files.ts:126`, `README.md`. Diagnostic personal storage/configuration notes. |
| S29 | `Dockerfile:1`, `docker-entrypoint.sh:1`, `docker-compose.yml:1`, `scripts/migrate.mjs:1`, `src/lib/server/db/seed.ts:1`, `.github/workflows/docker-publish.yml:1`, `src/env.ts:1`. Runtime/seed/configuration. |
| S30 | `src/routes/test/+page.svelte:220`, `src/routes/test/IdentityCheck.svelte:51`, `src/routes/test/identity.server.ts:11`, `src/lib/clearance/identity.ts`, `src/lib/server/handwriting.ts`. Diagnostic scan/identity. |

| Term | Definition |
| --- | --- |
| Actor | Account responsible for a saved event/action. |
| Current pointer | Student row's explicit link to its current enrollment. |
| Draft | Unsaved local edit, or saved but unfinalized data, depending on context. |
| Finalized | Saved grades released and locked until permitted admin reopening. |
| INC | Incomplete; a finalized subject attempt with no numeric grade. |
| Snapshot | Historical copy of names/codes/units or before/after state that later edits do not automatically rewrite. |
| Revision | Counter/token compared during save to reject stale state. |
| Lease/claim | Temporary ownership marker coordinating concurrent provisioning or meeting sends. |
| OCR | Optical character recognition of text from an image. |
| Rectification | Transforming photographed form corners into aligned reference geometry. |
| TOTP | Time-based one-time password generated by an authenticator app. |
| COR | Certificate of Registration PDF for an eligible saved enrollment. |
| Provider acceptance | Email send request was accepted by SMTP/Resend; not inbox receipt. |
| Voided | Incorrect enrollment preserved but excluded from valid-term operation. |
| Dropped | Actual withdrawal attempt preserved historically. |
| Ready clearance | Passing saved evidence awaiting the student's explicit request. |
| Requested clearance | Evidence submitted for staff review, not automatic enrollment. |
