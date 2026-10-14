import { activateCurriculum, changeCurriculumState } from '#lib/actions/curriculum.remote.js';
import { showLoading, showSuccess, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
import { refreshAll } from '$app/navigation';

export async function confirmCurriculumActivation(record: {
	id: string;
	name: string;
	programCode: string;
	status: 'draft' | 'inactive' | 'active' | 'archived';
	publishedAt: Date | null;
}) {
	if (
		!(await showYesNo({
			title: 'Activate curriculum?',
			message: `Use ${record.name} as the active curriculum for ${record.programCode}? ${record.publishedAt === null ? 'This publishes the curriculum and locks editing. ' : ''}The previous active curriculum will be archived. Existing students keep their assigned curriculum.`,
			warning: true,
			yesText: 'Activate',
			noText: 'Cancel'
		}))
	)
		return;
	showLoading();
	await activateCurriculum(record.id);
	await refreshAll();
	showSuccess('Curriculum activated successfully');
}

export async function confirmCurriculumStateChange(
	record: { id: string; name: string; publishedAt: Date | null },
	action: 'archive' | 'restore' | 'deactivate'
) {
	const label =
		action === 'archive' ? 'Archive' : action === 'restore' ? 'Unarchive' : 'Deactivate';
	const impact =
		action === 'archive'
			? 'If active, it will be removed as the program’s current curriculum.'
			: action === 'deactivate'
				? 'The program will have no active curriculum until another is activated.'
				: record.publishedAt === null
					? 'This unarchives the draft for editing.'
					: 'This unarchives the curriculum as Inactive. Activate it separately to use it for the program.';
	if (
		!(await showYesNo({
			title: `${label} curriculum?`,
			message: `${label} ${record.name}? ${impact} Existing enrollment assignments stay unchanged.`,
			warning: action !== 'restore',
			yesText: label,
			noText: 'Cancel'
		}))
	)
		return;
	showLoading();
	await changeCurriculumState({ id: record.id, action });
	await refreshAll();
	showSuccess(
		`Curriculum ${action === 'archive' ? 'archived' : action === 'restore' ? 'unarchived' : 'deactivated'} successfully`
	);
}
