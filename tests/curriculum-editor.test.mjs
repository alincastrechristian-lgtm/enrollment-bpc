import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('curriculum pages save complete drafts, retain row IDs, and keep registrars read-only', async () => {
	const root = mkdtempSync(path.resolve('.tmp-curriculum-editor-'));
	const files = {
		'index.html':
			'<html data-theme="light"><main id="app" class="bg-base-200 p-6"></main><script type="module" src="/main.js"></script></html>',
		'style.css': "@import '../src/routes/layout.css'; @source '../src';",
		'main.js':
			"import './style.css'; import {mount} from 'svelte'; import Harness from './Harness.svelte'; mount(Harness,{target:document.getElementById('app')});",
		'state.svelte.js': 'export const page=$state({url:new URL(window.location.href)});',
		'paths.js':
			"export function resolve(route,params){return '/portal'+route.replace('[curriculumId]',params?.curriculumId);}",
		'navigation.js': `import {onDestroy} from 'svelte'; import {page} from './state.svelte.js';
			const hooks=new Set(); window.navigation=[]; window.refreshes=0;
			export function beforeNavigate(hook){hooks.add(hook);onDestroy(()=>hooks.delete(hook));}
			window.attemptNavigation=(url)=>{let cancelled=false;for(const hook of hooks)hook({to:{url:new URL(url,window.location.href)},willUnload:false,cancel:()=>cancelled=true});return !cancelled;};
			export async function goto(url,options){if(window.attemptNavigation(url)){window.navigation.push({url,options});page.url=new URL(url,window.location.href);}}
			export async function refreshAll(){window.refreshes++;if(window.failRefresh)throw new Error("Refresh failed");window.updateCatalogs?.();}`,
		'actions.js': `window.creations=[];window.updates=[];window.deletions=[];window.failSave=false;
			export async function createCurriculum(data){if(window.failSave)throw new Error('Save failed');window.creations.push(data);return {id:'created'};}
			export async function updateCurriculum(data){if(window.failSave)throw new Error('Save failed');window.updates.push(data);return {id:data.id};}
			export async function deleteCurriculum(id){window.deletions.push(id);}`,
		'catalog-actions.js': `window.programCreations=[];window.subjectCreations=[];window.newPrograms=[];window.newSubjects=[];window.catalogUpdates=[];window.failCatalogSave=false;
			function create(kind,data){if(window.failCatalogSave)throw new Error('Duplicate code');window[kind+'Creations'].push(data);const record={...data,id:kind+'-'+window[kind+'Creations'].length,name:data.name.trim(),code:data.code.trim()};window[kind==='program'?'newPrograms':'newSubjects'].push(record);return record;}
			export async function createProgram(data){return create('program',data);}
			export async function createSubject(data){return create('subject',data);}
			export async function updateProgram(data){window.catalogUpdates.push({kind:'program',data});}
			export async function updateSubject(data){window.catalogUpdates.push({kind:'subject',data});}
			export async function deleteProgram(){}
			export async function deleteSubject(){}`,
		'popup.js': `window.messages=[];window.confirmDelete=true;
			export function showError(message){window.messages.push(message);}
			export function showLoading(){}
			export function showSuccess(message){window.messages.push(message);}
			export async function showYesNo(){return window.confirmDelete;}`,
		'Harness.svelte': `<script>
			import Editor from '${path.resolve('src/routes/user/curriculum/CurriculumEditor.svelte').replaceAll('\\', '/')}';
			import RecordCatalog from '${path.resolve('src/lib/components/Catalog/RecordCatalog.svelte').replaceAll('\\', '/')}';
			import List from '${path.resolve('src/routes/user/curriculum/+page.svelte').replaceAll('\\', '/')}';
			import View from '${path.resolve('src/routes/user/curriculum/[curriculumId]/+page.svelte').replaceAll('\\', '/')}';
			let mode=$state('new'); window.show=(value)=>mode=value;
			let programs=$state([{id:'p',name:'Information Systems',code:'BSIS',isActive:true}]);
			let subjects=$state([{id:'s1',name:'Introduction',code:'IS101',isActive:true},{id:'s2',name:'Programming',code:'IS102',isActive:true}]);
			window.updateCatalogs=()=>{programs=[programs[0],...window.newPrograms];subjects=[...subjects.slice(0,2),...window.newSubjects];};
			const curriculum={id:'c',name:'2026 Curriculum',programId:'p',programName:'Information Systems',programCode:'BSIS',publishedAt:null,isActive:true};
			const entries=[{id:'entry-1',curriculumId:'c',subjectId:'s1',subjectName:'Original Introduction',subjectCode:'IS101',yearLevel:1,semester:1,units:3}];
		</script>
		{#key mode}
			{#if mode==='new'}<Editor {programs} {subjects} />
			{:else if mode.startsWith('catalog-')}<RecordCatalog kind={mode.includes('subject')?'subject':'program'} records={(mode.includes('subject')?subjects:programs).map(record=>({...record,description:'Existing description'}))} total={1} search="" filters={{}} canManage={!mode.endsWith('registrar')} />
			{:else if mode==='edit'}<Editor {programs} {subjects} {curriculum} {entries} />
			{:else if mode==='empty'}<Editor programs={[]} subjects={[]} />
			{:else if mode.startsWith('list')}<List data={{records:[{...curriculum,subjectCount:1,totalUnits:3}],total:1,search:'',status:'all',filters:{},canManage:mode==='list-admin'}} />
			{:else}<View data={{curriculum:{...curriculum,publishedAt:mode==='published'?new Date():null},entries,canManage:mode!=='registrar'}} />{/if}
		{/key}`
	};
	let server, browser;
	try {
		for (const [name, contents] of Object.entries(files))
			writeFileSync(path.join(root, name), contents);
		server = await createServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
			resolve: {
				alias: [
					{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
					{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
					{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
					{
						find: '#lib/actions/program.remote.js',
						replacement: path.join(root, 'catalog-actions.js')
					},
					{
						find: '#lib/actions/subject.remote.js',
						replacement: path.join(root, 'catalog-actions.js')
					},
					{ find: '#lib/actions/curriculum.remote.js', replacement: path.join(root, 'actions.js') },
					{
						find: '#lib/components/Popup/Popup.svelte.js',
						replacement: path.join(root, 'popup.js')
					},
					{ find: '#lib', replacement: path.resolve('src/lib') }
				]
			},
			server: { host: '127.0.0.1', port: 0 }
		});
		await server.listen();
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
		async function selectCatalog(label, code) {
			await page.getByRole('button', { name: label, exact: true }).click();
			await page.getByRole('button', { name: new RegExp(`^${code} `) }).click();
		}
		async function openCreate(label, kind) {
			await page.getByRole('button', { name: label, exact: true }).click();
			await page.getByRole('button', { name: `New ${kind}`, exact: true }).click();
		}

		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Back to curricula' })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Curriculum details' })).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await page.getByLabel('Curriculum name').fill('2027 Curriculum');
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect(page.getByText('Select a program to continue.')).toBeVisible();
		await expect(page.getByRole('searchbox', { name: 'Search programs' })).toBeFocused();
		await page.getByRole('searchbox', { name: 'Search programs' }).fill('information');
		await expect(page.getByRole('button', { name: /^BSIS / })).toBeVisible();
		await page.getByRole('searchbox', { name: 'Search programs' }).fill('bsis');
		await page.getByRole('searchbox', { name: 'Search programs' }).press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(page.getByText('Select a program to continue.')).toHaveCount(0);

		await selectCatalog('Program', 'BSIS');
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		await selectCatalog('Subject 1', 'IS101');
		await page.getByRole('button', { name: 'Subject 1', exact: true }).click();
		const subjectSearch = page.getByRole('searchbox', { name: 'Search subjects' });
		await subjectSearch.fill('programming');
		await expect(page.getByRole('button', { name: /^IS102 / })).toBeVisible();
		await expect(page.getByRole('button', { name: /^IS101 / })).toHaveCount(0);
		await subjectSearch.fill('is102');
		await subjectSearch.press('Enter');
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'IS102'
		);
		await page.getByRole('button', { name: 'Subject 1', exact: true }).click();
		await expect(subjectSearch).toHaveValue('');
		await subjectSearch.fill('no matching subject');
		await expect(page.getByText('No matches found.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'New Subject', exact: true })).toBeVisible();
		await subjectSearch.press('Escape');
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'IS102'
		);
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toBeFocused();
		await selectCatalog('Subject 1', 'IS101');

		// Creating catalog records must preserve the curriculum draft and select the returned IDs.
		await openCreate('Program', 'Program');
		const programDialog = page.getByRole('dialog', { name: 'New Program' });
		await expect(programDialog).toBeVisible();
		await programDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Program', exact: true })).toContainText('BSIS');
		await openCreate('Program', 'Program');
		await programDialog.getByLabel('Name', { exact: true }).fill('New Program');
		await programDialog.getByLabel('Code', { exact: true }).fill('NEW');
		await programDialog.getByRole('button', { name: 'Create Program' }).click();
		await expect(programDialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Program', exact: true })).toContainText('NEW');
		await page.getByRole('button', { name: 'Program', exact: true }).click();
		await expect(page.getByRole('button', { name: /^NEW / })).toHaveCount(1);
		await page.getByRole('searchbox', { name: 'Search programs' }).press('Escape');
		await expect(page.getByLabel('Curriculum name')).toHaveValue('2027 Curriculum');
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'IS101'
		);
		assert.equal(await page.evaluate(() => window.creations.length), 0);
		await selectCatalog('Program', 'BSIS');
		await openCreate('Subject 1', 'Subject');
		const subjectDialog = page.getByRole('dialog', { name: 'New Subject' });
		await subjectDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'IS101'
		);
		await openCreate('Subject 1', 'Subject');
		await subjectDialog.getByLabel('Name', { exact: true }).fill('New Subject');
		await subjectDialog.getByLabel('Code', { exact: true }).fill('NEW101');
		await page.evaluate(() => (window.failCatalogSave = true));
		await subjectDialog.getByRole('button', { name: 'Create Subject' }).click();
		await expect.poll(() => page.evaluate(() => window.messages.at(-1))).toBe('Duplicate code');
		await expect(subjectDialog).toBeVisible();
		await expect(subjectDialog.getByLabel('Name', { exact: true })).toHaveValue('New Subject');
		await page.evaluate(() => {
			window.failCatalogSave = false;
			window.failRefresh = true;
		});
		await subjectDialog.getByRole('button', { name: 'Create Subject' }).click();
		await expect(subjectDialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'NEW101'
		);
		await expect(page.getByLabel('Curriculum name')).toHaveValue('2027 Curriculum');
		assert.equal(await page.evaluate(() => window.subjectCreations.length), 1);
		await expect.poll(() => page.evaluate(() => window.messages.at(-1))).toContain('Subject saved');
		await page.evaluate(() => (window.failRefresh = false));
		await selectCatalog('Subject 1', 'IS101');
		await page.getByLabel('Year for subject 1').fill('2');
		await page.getByLabel('Semester for subject 1').selectOption('2');
		await page.getByLabel('Units for subject 1').fill('4');
		page.once('dialog', (dialog) => dialog.dismiss());
		assert.equal(
			await page.evaluate(() => window.attemptNavigation('/portal/user/curriculum')),
			false
		);
		await page.evaluate(() => (window.failSave = true));
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect(page.getByRole('alert')).toHaveText('Save failed');
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'IS101'
		);
		await page.evaluate(() => (window.failSave = false));
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.creations.length)).toBe(1);
		assert.deepEqual(await page.evaluate(() => window.creations[0]), {
			name: '2027 Curriculum',
			programId: 'p',
			subjects: [{ subjectId: 's1', yearLevel: 2, semester: 2, units: 4 }]
		});
		assert.equal(
			await page.evaluate(() => window.navigation.at(-1).url),
			'/portal/user/curriculum/created'
		);

		await page.evaluate(() => window.show('edit'));
		await expect(page.getByLabel('Curriculum name')).toHaveValue('2026 Curriculum');
		await page.getByLabel('Units for subject 1').fill('5');
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		await page.getByRole('button', { name: 'Subject 2', exact: true }).click();
		await expect(page.getByRole('button', { name: /^IS101 / })).toBeDisabled();
		await page.getByRole('searchbox', { name: 'Search subjects' }).press('Escape');
		await selectCatalog('Subject 2', 'IS102');
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.updates.length)).toBe(1);
		const update = await page.evaluate(() => window.updates[0]);
		assert.equal(update.id, 'c');
		assert.equal(update.subjects[0].id, 'entry-1');
		assert.equal(update.subjects[0].units, 5);
		assert.equal(update.subjects[1].subjectId, 's2');
		assert.equal('id' in update.subjects[1], false);
		await page.evaluate(() => window.show('edit'));
		// Remount to verify removal sends the entire remaining list.
		await page.evaluate(() => window.show('new'));
		await page.evaluate(() => window.show('edit'));
		await page.getByRole('button', { name: 'Remove subject 1' }).click();
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.updates.length)).toBe(2);
		assert.deepEqual(await page.evaluate(() => window.updates[1].subjects), []);

		await page.evaluate(() => window.show('registrar'));
		await expect(page.getByRole('link', { name: 'Edit curriculum' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
		await expect(page.getByRole('table')).toContainText('Original Introduction');
		await page.evaluate(() => window.show('published'));
		await expect(page.getByText(/This curriculum is\s+read-only/)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Edit curriculum' })).toHaveCount(0);
		await page.evaluate(() => window.show('list-registrar'));
		await expect(page.getByRole('link', { name: 'New Curriculum' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Actions for 2026 Curriculum' }).click();
		await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
		await page.evaluate(() => window.show('list-admin'));
		await expect(page.getByRole('link', { name: 'New Curriculum' })).toHaveAttribute(
			'href',
			'/portal/user/curriculum/new'
		);
		await page.getByRole('button', { name: 'Actions for 2026 Curriculum' }).click();
		await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/curriculum/c/edit'
		);
		await page.evaluate(() => (window.confirmDelete = false));
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		assert.equal(await page.evaluate(() => window.deletions.length), 0);
		await page.evaluate(() => (window.confirmDelete = true));
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.deletions.length)).toBe(1);
		assert.equal(await page.evaluate(() => window.deletions[0]), 'c');
		assert.equal(await page.evaluate(() => window.refreshes), 3);
		await page.evaluate(() => window.show('empty'));
		await expect(page.getByRole('button', { name: 'Save curriculum', exact: true })).toBeDisabled();
		await expect(page.getByRole('link', { name: 'Open programs' })).toBeVisible();
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		await openCreate('Subject 1', 'Subject');
		await expect(page.getByRole('dialog', { name: 'New Subject' })).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

		// The catalogs use the same dialog for both creation and editing.
		for (const kind of ['program', 'subject']) {
			const label = kind === 'program' ? 'Program' : 'Subject';
			const originalName = kind === 'program' ? 'Information Systems' : 'Introduction';
			await page.evaluate((mode) => window.show(mode), `catalog-${kind}`);
			await page.getByRole('button', { name: `New ${label}`, exact: true }).click();
			const dialog = page.getByRole('dialog');
			await dialog.getByLabel('Name', { exact: true }).fill(`Catalog ${label}`);
			await dialog.getByLabel('Code', { exact: true }).fill('CATALOG');
			await dialog.getByRole('button', { name: `Create ${label}` }).click();
			await expect(dialog).toBeHidden();
			await page.getByRole('button', { name: `Actions for ${originalName}` }).click();
			await page.getByRole('button', { name: 'Edit', exact: true }).click();
			await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(originalName);
			await expect(dialog.getByLabel('Description')).toHaveValue('Existing description');
			await dialog.getByLabel('Name', { exact: true }).fill(`Updated ${label}`);
			await dialog.getByRole('button', { name: 'Save changes' }).click();
			await expect(dialog).toBeHidden();
			const update = await page.evaluate(() => window.catalogUpdates.at(-1));
			assert.equal(update.kind, kind);
			assert.equal(update.data.id, kind === 'program' ? 'p' : 's1');
			assert.equal(update.data.name, `Updated ${label}`);
			await page.evaluate((mode) => window.show(mode), `catalog-${kind}-registrar`);
			await expect(page.getByRole('button', { name: `New ${label}`, exact: true })).toHaveCount(0);
			await expect(page.locator('dialog')).toHaveCount(0);
		}
		// Newly created records also satisfy native validation; pickers fit a narrow viewport.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.evaluate(() => window.show('new'));
		await page.getByLabel('Curriculum name').fill('Fresh Curriculum');
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect(page.getByText('Select a program to continue.')).toBeVisible();
		const programPicker = page.getByRole('dialog', { name: 'Search programs' });
		const programBounds = await programPicker.boundingBox();
		assert.ok(programBounds.x >= 0 && programBounds.x + programBounds.width <= 390);
		await programPicker.getByRole('button', { name: 'New Program', exact: true }).click();
		await programDialog.getByLabel('Name', { exact: true }).fill('Fresh Program');
		await programDialog.getByLabel('Code', { exact: true }).fill('FRESH');
		await programDialog.getByRole('button', { name: 'Create Program' }).click();
		await expect(programDialog).toBeHidden();
		await expect(page.getByText('Select a program to continue.')).toHaveCount(0);
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect(page.getByText('Select a subject to continue.')).toBeVisible();
		const subjectPicker = page.getByRole('dialog', { name: 'Search subjects' });
		await expect(
			subjectPicker.getByRole('button', { name: 'New Subject', exact: true })
		).toBeVisible();
		const subjectBounds = await subjectPicker.boundingBox();
		assert.ok(subjectBounds.x >= 0 && subjectBounds.x + subjectBounds.width <= 390);
		await subjectPicker.getByRole('button', { name: 'New Subject', exact: true }).click();
		await subjectDialog.getByLabel('Name', { exact: true }).fill('Fresh Subject');
		await subjectDialog.getByLabel('Code', { exact: true }).fill('FRESH101');
		await subjectDialog.getByRole('button', { name: 'Create Subject' }).click();
		await expect(subjectDialog).toBeHidden();
		await expect(page.getByText('Select a subject to continue.')).toHaveCount(0);
		await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.creations.length)).toBe(2);
		const fresh = await page.evaluate(() => window.creations.at(-1));
		assert.equal(fresh.programId, 'program-3');
		assert.equal(fresh.subjects[0].subjectId, 'subject-3');
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
		rmdirSync(root);
	}
});
