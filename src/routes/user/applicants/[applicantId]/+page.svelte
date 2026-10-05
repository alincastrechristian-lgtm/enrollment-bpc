<script lang="ts">
	import { deleteApplicant } from '#lib/actions/applicant.remote.js';
	import { createStudent } from '#lib/actions/user.remote.js';
	import { hasAllApplicantDocuments } from '#lib/applicants.js';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { goto, refreshAll } from '$app/navigation';
	import {
		CalendarDays,
		Check,
		CircleCheck,
		Clock3,
		FileCheck,
		GraduationCap,
		Mail,
		MapPin,
		Pencil,
		Phone,
		Settings,
		Trash2,
		User,
		UserPlus
	} from '@lucide/svelte';
	import ApplicantDialog from '../ApplicantDialog.svelte';
	import { getApplicantStatus, statusBadge } from '../functions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let applicantDialog: ReturnType<typeof ApplicantDialog>;
	let busy = $state(false);
	const applicant = $derived(data.applicant);
	const canCreateStudent = $derived(hasAllApplicantDocuments(applicant) && !applicant.userId);

	async function removeApplicant() {
		if (busy) return;
		busy = true;
		const deleting = applicant;
		try {
			const confirmed = await showYesNo({
				title: 'Delete applicant?',
				message: `Delete ${deleting.name} (${deleting.applicationId})?`,
				warning: true,
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			await deleteApplicant(deleting.id);
			await goto('/user/applicants', { refreshAll: true });
			showSuccess('Applicant deleted successfully');
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to delete applicant');
		} finally {
			busy = false;
		}
	}

	async function createStudentAccount() {
		if (busy || !canCreateStudent) return;
		busy = true;
		const creating = applicant;
		try {
			const confirmed = await showYesNo({
				title: 'Create student account?',
				message: `Create a student account for ${creating.name} (${creating.applicationId}) using ${creating.email}?`,
				yesText: 'Create account',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			const result = await createStudent({ applicantId: creating.id });
			await refreshAll();
			if (result.invitationSent) {
				showSuccess('Student account created successfully');
			} else {
				showError(
					'Student account created, but invitation failed. Resend it from the Students page.'
				);
			}
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to create student account');
		} finally {
			busy = false;
		}
	}
	const initials = $derived(
		applicant.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((name) => name.charAt(0))
			.join('')
			.toUpperCase()
	);
	const statusClass = $derived(statusBadge(applicant));
	const dateFormatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
	const requirements = $derived([
		{ name: 'PSA Birth Certificate', received: applicant.hasBirthCertificate },
		{ name: 'Form 138 / Report Card', received: applicant.hasForm138 },
		{ name: 'Good Moral Certificate', received: applicant.hasGoodMoral },
		{ name: '2x2 Picture', received: applicant.hasPicture }
	]);
	const receivedCount = $derived(requirements.filter((requirement) => requirement.received).length);
</script>

<svelte:head>
	<title>{applicant.name} | Applicant Details</title>
</svelte:head>

<section class="mx-auto max-w-7xl space-y-6">
	<article class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
			<div class="flex min-w-0 items-center gap-4">
				<div
					class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary sm:size-20 sm:text-2xl"
					aria-hidden="true"
				>
					{initials}
				</div>
				<div class="min-w-0">
					<p class="mb-1 text-xs font-semibold tracking-wider text-base-content/50 uppercase">
						Applicant profile
					</p>
					<h1
						class="text-2xl font-bold tracking-tight wrap-break-word text-base-content sm:text-3xl"
					>
						{applicant.name}
					</h1>
					<p class="mt-2 font-mono text-xs break-all text-base-content/60 sm:text-sm">
						{applicant.applicationId}
					</p>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-2 self-end sm:self-center">
				<span
					class={`badge h-auto shrink-0 gap-2 self-start border-none px-3 py-2 text-xs font-bold lg:self-center ${statusClass}`}
				>
					<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
					{getApplicantStatus(applicant)}
				</span>
				<Dropdown
					id={`applicant-view-${applicant.id}`}
					label={`Actions for ${applicant.name}`}
					disabled={busy}
				>
					{#snippet trigger()}
						<Settings class="size-4" aria-hidden="true" />
					{/snippet}
					<ul class="menu w-full p-0">
						<li>
							<button
								type="button"
								disabled={busy}
								onclick={() => applicantDialog.openApplicant(applicant)}
							>
								<Pencil class="size-4" aria-hidden="true" />Edit Applicant
							</button>
						</li>
						{#if !applicant.userId}
							<li>
								<button
									type="button"
									disabled={busy || !canCreateStudent}
									title={canCreateStudent
										? 'Create a linked student account'
										: 'Receive all documents before creating a student account'}
									onclick={createStudentAccount}
								>
									<UserPlus class="size-4" aria-hidden="true" />Create Student Account
								</button>
							</li>
						{/if}
						<li class="mt-1 border-t border-base-300 pt-1 text-error">
							<button type="button" disabled={busy} onclick={removeApplicant}>
								<Trash2 class="size-4" aria-hidden="true" />Delete Applicant
							</button>
						</li>
					</ul>
				</Dropdown>
			</div>
		</div>
		<dl class="grid gap-5 border-t border-base-300 bg-base-200/40 p-5 sm:grid-cols-3 sm:p-6">
			<div>
				<dt class="flex items-center gap-2 text-xs font-semibold text-base-content/50">
					<GraduationCap class="size-4" aria-hidden="true" />Program
				</dt>
				<dd class="mt-2 text-sm font-bold wrap-break-word">{applicant.program}</dd>
			</div>
			<div>
				<dt class="flex items-center gap-2 text-xs font-semibold text-base-content/50">
					<User class="size-4" aria-hidden="true" />Year level
				</dt>
				<dd class="mt-2 text-sm font-bold">Year {applicant.yearLevel}</dd>
			</div>
			<div>
				<dt class="flex items-center gap-2 text-xs font-semibold text-base-content/50">
					<CalendarDays class="size-4" aria-hidden="true" />Date applied
				</dt>
				<dd class="mt-2 text-sm font-bold">
					<time datetime={applicant.dateApplied.toISOString()}
						>{dateFormatter.format(applicant.dateApplied)}</time
					>
				</dd>
			</div>
		</dl>
	</article>

	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
		<article
			class="min-w-0 rounded-2xl border border-base-300 bg-base-100 shadow-sm"
			aria-labelledby="contact-title"
		>
			<div class="border-b border-base-300 p-5 sm:p-6">
				<h2 id="contact-title" class="flex items-center gap-2 font-bold">
					<User class="size-5 text-primary" aria-hidden="true" />Contact information
				</h2>
				<p class="mt-1 text-xs text-base-content/50">Applicant contact and address details.</p>
			</div>
			<dl class="space-y-5 p-5 sm:p-6">
				<div class="flex items-start gap-3">
					<div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-base-200">
						<Mail class="size-4 text-base-content/60" aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<dt class="text-xs font-semibold text-base-content/50">Email address</dt>
						<dd class="mt-1 text-sm font-medium wrap-break-word">
							{applicant.email || 'Not provided'}
						</dd>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-base-200">
						<Phone class="size-4 text-base-content/60" aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<dt class="text-xs font-semibold text-base-content/50">Contact number</dt>
						<dd class="mt-1 text-sm font-medium wrap-break-word">
							{applicant.contactNumber || 'Not provided'}
						</dd>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-base-200">
						<MapPin class="size-4 text-base-content/60" aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<dt class="text-xs font-semibold text-base-content/50">Address</dt>
						<dd
							class="mt-1 text-sm leading-relaxed font-medium wrap-break-word whitespace-pre-line"
						>
							{applicant.address || 'Not provided'}
						</dd>
					</div>
				</div>
			</dl>
		</article>

		<article
			class="min-w-0 overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
			aria-labelledby="requirements-title"
		>
			<div class="border-b border-base-300 p-5 sm:p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 id="requirements-title" class="flex items-center gap-2 font-bold">
						<FileCheck class="size-5 text-primary" aria-hidden="true" />Document requirements
					</h2>
					<span class="text-xs font-semibold text-base-content/60"
						>{receivedCount} of {requirements.length} received</span
					>
				</div>
				<p class="mt-1 text-xs text-base-content/50">
					Physical documents received by the registrar.
				</p>
				<progress
					class="progress mt-4 h-2 w-full progress-primary"
					value={receivedCount}
					max={requirements.length}
					aria-label="Documents received"
				></progress>
			</div>
			<ul class="divide-y divide-base-200">
				{#each requirements as requirement (requirement.name)}
					<li class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<div
								class={`flex size-9 shrink-0 items-center justify-center rounded-xl ${requirement.received ? 'bg-success/10 text-success' : 'bg-base-200 text-base-content/40'}`}
							>
								{#if requirement.received}<Check class="size-4" aria-hidden="true" />{:else}<Clock3
										class="size-4"
										aria-hidden="true"
									/>{/if}
							</div>
							<p class="text-sm font-medium">{requirement.name}</p>
						</div>
						<span
							class={`badge shrink-0 gap-1.5 border-none text-xs font-semibold ${requirement.received ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
							>{requirement.received ? 'Received' : 'Missing'}</span
						>
					</li>
				{/each}
			</ul>
			<div
				class={`flex items-start gap-2 border-t border-base-300 px-5 py-4 text-xs sm:px-6 ${receivedCount === requirements.length ? 'bg-success/5 text-success' : 'bg-base-200/40 text-base-content/60'}`}
			>
				{#if receivedCount === requirements.length}<CircleCheck
						class="size-4 shrink-0"
						aria-hidden="true"
					/>
					<p>All required documents have been received.</p>{:else}<Clock3
						class="size-4 shrink-0"
						aria-hidden="true"
					/>
					<p>
						{requirements.length - receivedCount} document{requirements.length - receivedCount === 1
							? ''
							: 's'} still needed to complete the requirements.
					</p>{/if}
			</div>
		</article>
	</div>
</section>

<ApplicantDialog bind:this={applicantDialog} bind:busy />
