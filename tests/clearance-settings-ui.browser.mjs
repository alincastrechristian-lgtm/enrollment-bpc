import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test(
	'clearance settings show one workspace, preserve drafts, save every step and safely replace images',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-clearance-settings-ui-'));
		let server, browser;
		const source = (file) => path.resolve(file).replaceAll('\\', '/');
		try {
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app" style="max-width:1280px;margin:auto;padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js': `import './style.css';import {mount} from 'svelte';import Page from '${source('src/routes/user/settings/clearance/+page.svelte')}';mount(Page,{target:document.getElementById('app')});`,
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'paths.js': 'export const resolve=route=>route;',
				'popup.js':
					'window.messages=[];export const showLoading=()=>{};export const showSuccess=message=>window.messages.push(message);export const showError=message=>window.messages.push(message);',
				'fixture.js': `const area=(label,kind,x,y,width,height,expected='')=>({id:crypto.randomUUID(),label,kind,box:{x,y,width,height},expected});
				export const definition={corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],semester:'2',schoolYear:'2025-2026',areas:[area('School name','text',.3,.02,.4,.04,'BULACAN POLYTECHNIC COLLEGE'),area('Form title','text',.32,.12,.35,.04,'Student Clearance Form'),area('School seal','image',.08,.02,.16,.2),area('Semester','semester',.32,.17,.2,.04),area('Academic year','academicYear',.5,.17,.2,.04)],personalFields:[{id:crypto.randomUUID(),field:'studentName',box:{x:.1,y:.7,width:.5,height:.05}},{id:crypto.randomUUID(),field:'studentNumber',box:{x:.1,y:.8,width:.5,height:.05}}],officeRows:['Library','Registrar'].map((label,i)=>({id:crypto.randomUUID(),label,office:{x:.08,y:.3+i*.08,width:.12,height:.03},cleared:{x:.27,y:.3+i*.08,width:.045,height:.05},signature:{x:.62,y:.3+i*.08,width:.2,height:.05}}))};`,
				'actions.svelte.js': `import{definition}from'./fixture.js';let state=$state.raw({configured:true,automatedClearanceVerificationEnabled:true,personalInfoVerificationEnabled:true,hasGeminiKey:true,geminiModel:'gemini-3.1-flash-lite',template:{filename:'clearance-reference.jpg',size:79329,uploadedAt:'2026-10-19T00:00:00.000Z',revision:crypto.randomUUID(),definition:structuredClone(definition)}});
				window.saved=[];window.uploads=[];window.failUpload=false;window.clearTemplate=()=>state={...state,template:null};
				export function getClearanceSettings(){return{get current(){return state;}};}
                window.verificationSaves=[];window.geminiTests=[];window.handwritingTests=[];
 export async function readClearanceTestHandwriting(input){window.handwritingTests.push(input);return window.handwritingError?{success:false,message:'Gemini request failed (HTTP 404, NOT_FOUND; model gemini-2.5-flash). The configured model was not found.'}:{success:true,readings:window.blankHandwriting?{name:'',studentNumber:'',warnings:{name:'Gemini returned an unusable transcription.'}}:{name:'Jonnel Mrei Palileo',studentNumber:'23016578'}};}
                export async function saveClearanceVerification(input){window.verificationSaves.push(input);state={...state,...input,hasGeminiKey:input.clearGeminiKey?false:!!input.geminiApiKey||state.hasGeminiKey};delete state.geminiApiKey;return{success:true};}
                export async function testClearanceGemini(input){window.geminiTests.push(input);return{success:true,message:'Gemini connection successful.'};}

				export async function saveClearanceAreas(input){window.saved.push(input);state={...state,template:{...state.template,revision:crypto.randomUUID(),definition:structuredClone(input.definition)}};return{success:true};}
				export const uploadClearanceTemplate={fields:new Proxy({allIssues:()=>[]},{get:(target,name)=>target[name]??{as:(type,value)=>({name,type,...(value===undefined?{}:{value})})}}),enhance:callback=>({onsubmit:async event=>{event.preventDefault();const element=event.currentTarget;await callback({element,result:{},submit:async()=>{if(window.failUpload)throw Error('Simulated storage error');const file=new FormData(element).get('file');window.uploads.push(file.name);state={...state,template:{filename:file.name,size:file.size,uploadedAt:new Date().toISOString(),revision:crypto.randomUUID(),definition:null}};return true;}});}})};`,
				'scan.js': `import{definition}from'./fixture.js';
				export async function loadImage(){const image=new Image();image.src='/reference.jpg';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas;}
				export function identityCrops(source,corners,config){window.cropFields=config.personalFields.map(f=>f.field);return{name:source,studentNumber:source};}export const loadUpload=loadImage;export const alignTemplate=image=>image;export const detectBorder=()=>structuredClone(definition.corners);
				export async function detectOfficeRows(_image,_corners,onProgress,signal){onProgress('Detecting offices');if(window.deferDetection)await new Promise((resolve,reject)=>{window.finishDetection=resolve;signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});return{rows:structuredClone(definition.officeRows),hints:[]};}
				export async function detectPersonalFields(){return{fields:structuredClone(definition.personalFields),hints:[]};}
				export async function detectTemplateAreas(){return{areas:structuredClone(definition.areas),semester:'2',schoolYear:'2025-2026',hints:[]};}
				export async function compareDefinedTemplate(_reference,_source,_corners,_definition,term){window.testTerm=structuredClone(term);return[{label:'Upload: School name',verdict:'pass',detail:'Printed school matches'}];}`
			};
			for (const [name, content] of Object.entries(files))
				writeFileSync(path.join(root, name), content);
			server = await createServer({
				root,
				configFile: false,
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{
							find: '#lib/actions/clearance.remote.js',
							replacement: path.join(root, 'actions.svelte.js')
						},
						{
							find: '#lib/components/Popup/Popup.svelte.js',
							replacement: path.join(root, 'popup.js')
						},
						{ find: '#lib/clearance/scan.client.js', replacement: path.join(root, 'scan.js') },
						{ find: './scan.client', replacement: path.join(root, 'scan.js') },
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.route('**/reference.jpg', (route) =>
				route.fulfill({ path: source('static/clearance-reference.jpg'), contentType: 'image/jpeg' })
			);
			await page.route('**/user/clearance-template?*', (route) =>
				route.fulfill({ path: source('static/clearance-reference.jpg'), contentType: 'image/jpeg' })
			);
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			const steps = page.getByRole('navigation', { name: 'Template setup steps' });
			const workspace = page.getByRole('navigation', { name: 'Clearance workspace' });
			const assertPreviewFits = async (frame) => {
				await expect(frame.locator('img')).toBeVisible();
				await expect
					.poll(() => frame.locator('img').evaluate((img) => img.naturalWidth))
					.toBeGreaterThan(0);
				const geometry = await frame.evaluate((element) => {
					const img = element.querySelector('img');
					const bounds = element.getBoundingClientRect();
					const image = img.getBoundingClientRect();
					return {
						width: bounds.width,
						height: bounds.height,
						imageWidth: image.width,
						imageHeight: image.height,
						ratio: img.naturalWidth / img.naturalHeight,
						maxHeight: window.innerHeight * 0.65
					};
				});
				assert(geometry.imageHeight <= geometry.maxHeight + 1, JSON.stringify(geometry));
				assert(Math.abs(geometry.width - geometry.imageWidth - 2) < 1, JSON.stringify(geometry));
				assert(Math.abs(geometry.height - geometry.imageHeight - 2) < 1, JSON.stringify(geometry));
				assert(Math.abs(geometry.imageWidth / geometry.imageHeight - geometry.ratio) < 0.01);
			};

			const automation = page.getByRole('switch', { name: /Automated clearance verification/ });
			const personal = page.getByRole('switch', { name: /Verify student name and number/ });
			const key = page.getByLabel('Gemini API key', { exact: true });
			await expect(key).toHaveValue('');
			const model = page.getByLabel('Gemini model', { exact: true });
			await expect(model).toHaveValue('gemini-3.1-flash-lite');
			await model.selectOption('gemini-2.5-flash-lite');
			await key.fill('browser-unsaved-key');
			await page.getByRole('button', { name: 'Test Gemini', exact: true }).click();
			await expect(page.getByText('Gemini connection successful.', { exact: true })).toBeVisible();
			assert.equal(
				await page.evaluate(() => window.geminiTests[0].geminiApiKey),
				'browser-unsaved-key'
			);
			assert.equal(
				await page.evaluate(() => window.geminiTests[0].geminiModel),
				'gemini-2.5-flash-lite'
			);
			await automation.uncheck();
			await expect(personal).toBeDisabled();
			await page.getByRole('button', { name: 'Save verification settings', exact: true }).click();
			await expect(key).toHaveValue('');
			assert.equal(
				await page.evaluate(() => window.verificationSaves[0].geminiModel),
				'gemini-2.5-flash-lite'
			);
			assert.equal(
				await page.evaluate(
					() => window.verificationSaves[0].automatedClearanceVerificationEnabled
				),
				false
			);
			await automation.check();
			await page.getByRole('button', { name: 'Save verification settings', exact: true }).click();
			await expect(steps.getByRole('button', { name: 'Printed areas', exact: true })).toBeEnabled();
			await expect(page.getByLabel('Choose template image', { exact: true })).toHaveCount(0);
			await expect(
				page.getByRole('group', { name: 'Marked area editor', exact: true })
			).toHaveCount(1);
			await page.setViewportSize({ width: 2200, height: 1000 });
			await page.locator('#app').evaluate((element) => (element.style.maxWidth = 'none'));
			await assertPreviewFits(page.getByRole('group', { name: 'Marked area editor', exact: true }));
			await steps.getByRole('button', { name: 'Form outline', exact: true }).click();
			await assertPreviewFits(page.getByRole('group', { name: 'Form border editor', exact: true }));
			await steps.getByRole('button', { name: 'Printed areas', exact: true }).click();
			await page.setViewportSize({ width: 1360, height: 1000 });
			await page.locator('#app').evaluate((element) => (element.style.maxWidth = '1280px'));
			await page.getByLabel('Area label', { exact: true }).fill('Institution heading');
			await steps.getByRole('button', { name: 'Offices & signatures', exact: true }).click();
			const office = page.getByRole('region', {
				name: 'Offices, checkboxes and signatures',
				exact: true
			});
			await office.getByLabel('Office name', { exact: true }).fill('Library services');
			await expect(
				page.getByRole('group', { name: 'Marked area editor', exact: true })
			).toHaveCount(1);
			await office.locator('summary').filter({ hasText: 'Controls and coordinates' }).click();
			await assertPreviewFits(
				office.getByRole('group', { name: 'Marked area editor', exact: true })
			);
			const editor = office.getByRole('group', { name: 'Marked area editor', exact: true });
			await editor.scrollIntoViewIfNeeded();
			const bounds = await editor.boundingBox();
			const target = await editor
				.getByRole('button', { name: 'Move Office name', exact: true })
				.boundingBox();
			const beforeX = Number(await office.getByLabel('x %', { exact: true }).inputValue());
			await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
			await page.mouse.down();
			await page.mouse.move(target.x + target.width / 2 + 12, target.y + target.height / 2, {
				steps: 6
			});
			await page.mouse.up();
			const afterX = Number(await office.getByLabel('x %', { exact: true }).inputValue());
			assert(
				Math.abs(afterX - beforeX - 1200 / bounds.width) < 0.2,
				'Dragging uses resized preview coordinates'
			);
			await office.getByLabel('x %', { exact: true }).fill('9');
			await steps.getByRole('button', { name: 'Personal inputs', exact: true }).click();
			await expect(
				page.getByRole('region', { name: 'Personal information input areas', exact: true })
			).toBeVisible();
			await steps.getByRole('button', { name: 'Printed areas', exact: true }).click();
			await expect(page.getByLabel('Area label', { exact: true })).toHaveValue(
				'Institution heading'
			);
			await workspace.getByRole('button', { name: 'Test clearance', exact: true }).click();
			await expect(page.getByLabel('Upload test clearance', { exact: true })).toBeVisible();
			await expect(steps).not.toBeVisible();
			await page.getByLabel('Test enrollment semester', { exact: true }).fill('2');
			await page.getByLabel('Test enrollment school year', { exact: true }).fill('2027-2028');
			await page
				.getByLabel('Upload test clearance', { exact: true })
				.setInputFiles('static/clearance-written-example.jpg');

			const include = page.getByRole('checkbox', { name: /Test handwriting with Gemini/ });
			await expect(include).not.toBeChecked();
			await expect(page.getByRole('button', { name: 'Read handwriting', exact: true })).toHaveCount(
				0
			);
			await include.check();
			await page.getByRole('button', { name: 'Read handwriting', exact: true }).click();
			await expect(page.getByText('Jonnel Mrei Palileo', { exact: true })).toBeVisible();
			await expect(page.getByText('23016578', { exact: true })).toBeVisible();
			assert.equal(await page.evaluate(() => window.handwritingTests.length), 1);
			assert.deepEqual(await page.evaluate(() => window.cropFields), [
				'studentName',
				'studentNumber'
			]);
			await include.uncheck();
			await expect(page.getByText('Jonnel Mrei Palileo', { exact: true })).toHaveCount(0);
			await include.check();
			await page.evaluate(() => (window.blankHandwriting = true));
			await page.getByRole('button', { name: 'Read handwriting', exact: true }).click();
			await expect(page.getByText('No readable text returned', { exact: true })).toHaveCount(2);
			await expect(
				page.getByText('Gemini returned an unusable transcription.', { exact: true })
			).toBeVisible();

			await page.evaluate(() => (window.handwritingError = true));
			await page.getByRole('button', { name: 'Read handwriting', exact: true }).click();
			await expect(page.getByRole('alert').filter({ hasText: 'HTTP 404' })).toBeVisible();
			await expect(page.getByLabel('Gemini handwriting result', { exact: true })).toHaveCount(0);
			await page.getByRole('button', { name: 'Compare template', exact: true }).click();
			await expect(page.getByText('Matches saved template', { exact: true })).toBeVisible();
			assert.deepEqual(await page.evaluate(() => window.testTerm), {
				semester: '2',
				schoolYear: '2027-2028'
			});
			await page.getByLabel('Test enrollment school year', { exact: true }).fill('2028-2029');
			await expect(page.getByText('Matches saved template', { exact: true })).toHaveCount(0);
			await page.getByLabel('Test enrollment school year', { exact: true }).fill('2028-2030');
			await expect(
				page.getByRole('button', { name: 'Compare template', exact: true })
			).toBeDisabled();
			await expect(
				page.getByText(
					'Enter a valid semester and consecutive school years, for example 2026-2027.'
				)
			).toBeVisible();

			await workspace.getByRole('button', { name: 'Template setup', exact: true }).click();
			await expect(page.getByLabel('Area label', { exact: true })).toHaveValue(
				'Institution heading'
			);
			await steps.getByRole('button', { name: 'Offices & signatures', exact: true }).click();
			await expect(office.getByLabel('Office name', { exact: true })).toHaveValue(
				'Library services'
			);
			await expect(office.getByLabel('x %', { exact: true })).toHaveValue('9');
			await page.getByRole('button', { name: 'Save template areas', exact: true }).click();
			await expect.poll(() => page.evaluate(() => window.saved.length)).toBe(1);
			await expect(
				steps.getByRole('button', { name: 'Offices & signatures', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
			await expect(
				office.getByRole('button', { name: 'Auto-detect office rows', exact: true })
			).toBeEnabled();
			const saved = await page.evaluate(() => window.saved[0].definition);
			assert.equal(saved.areas[0].label, 'Institution heading');
			assert.equal(saved.officeRows[0].label, 'Library services');
			assert.equal(saved.officeRows[0].office.x, 0.09);
			assert.equal(saved.personalFields.length, 2);
			assert(!('semester' in saved));
			assert(!('schoolYear' in saved));
			await page.evaluate(() => (window.deferDetection = true));
			await office.getByRole('button', { name: 'Auto-detect office rows', exact: true }).click();
			await expect(
				steps.getByRole('button', { name: 'Personal inputs', exact: true })
			).toBeDisabled();
			await expect(
				workspace.getByRole('button', { name: 'Test clearance', exact: true })
			).toBeDisabled();
			await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeDisabled();
			await page.evaluate(() => window.finishDetection());
			await office.getByRole('button', { name: 'Discard office suggestions', exact: true }).click();
			await expect(office.getByLabel('Office name', { exact: true })).toHaveValue(
				'Library services'
			);
			mkdirSync('.tmp', { recursive: true });
			await page.screenshot({ path: '.tmp/clearance-settings-desktop.png', fullPage: true });
			await page.setViewportSize({ width: 390, height: 844 });
			await assertPreviewFits(
				office.getByRole('group', { name: 'Marked area editor', exact: true })
			);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
			await page.screenshot({ path: '.tmp/clearance-settings-mobile.png', fullPage: true });
			await page.getByRole('button', { name: 'Replace image', exact: true }).click();
			await expect(workspace).not.toBeVisible();
			await page
				.getByLabel('Choose template image', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			await page.evaluate(() => (window.failUpload = true));
			await page.getByRole('button', { name: 'Replace template', exact: true }).click();
			await expect
				.poll(() => page.evaluate(() => window.messages.at(-1)))
				.toBe('Could not save the template. Check storage connectivity and try again.');
			assert.equal(await page.evaluate(() => window.uploads.length), 0);
			await page.getByRole('button', { name: 'Cancel replacement', exact: true }).click();
			await expect(office.getByLabel('Office name', { exact: true })).toHaveValue(
				'Library services'
			);
			await page.evaluate(() => (window.failUpload = false));
			await page.getByRole('button', { name: 'Replace image', exact: true }).click();
			await page
				.getByLabel('Choose template image', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			await page.getByRole('button', { name: 'Replace template', exact: true }).click();
			await expect(
				steps.getByRole('button', { name: 'Form outline', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
			await expect(
				page.getByRole('button', { name: 'Use this outline', exact: true })
			).toBeEnabled();
			await assertPreviewFits(page.getByRole('group', { name: 'Form border editor', exact: true }));
			await expect(
				steps.getByRole('button', { name: 'Offices & signatures', exact: true })
			).toBeDisabled();
			await page.getByRole('button', { name: 'Use this outline', exact: true }).click();
			await expect(
				steps.getByRole('button', { name: 'Printed areas', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
			await expect(page.getByRole('list', { name: 'Marked areas', exact: true })).toHaveCount(0);
			await page.getByRole('button', { name: 'Auto-detect areas', exact: true }).click();
			await expect(page.getByRole('list', { name: 'Suggested areas', exact: true })).toBeVisible();
			await assertPreviewFits(page.getByRole('img', { name: /highlighted on the reference/ }));
			await expect(
				page.getByRole('group', { name: 'Marked area editor', exact: true })
			).toHaveCount(0);
			await expect(
				page.getByRole('button', { name: 'Save template areas', exact: true })
			).toBeDisabled();
			await page.getByRole('button', { name: /Use suggestions/ }).click();
			await expect(
				page.getByRole('group', { name: 'Marked area editor', exact: true })
			).toHaveCount(1);
			await expect(
				page.getByRole('button', { name: 'Save template areas', exact: true })
			).toBeEnabled();
			await page.evaluate(() => window.clearTemplate());
			await expect(page.getByLabel('Choose template image', { exact: true })).toBeVisible();
			await expect(workspace).toHaveCount(0);
			await page.screenshot({ path: '.tmp/clearance-settings-empty.png', fullPage: true });

			const cropResult = await page.evaluate(
				async (moduleUrl) => {
					const { identityCrops } = await import(moduleUrl);
					const source = document.createElement('canvas');
					source.width = 1000;
					source.height = 820;
					const ctx = source.getContext('2d');
					ctx.fillStyle = '#fff';
					ctx.fillRect(0, 0, 1000, 820);
					const boxes = [
						{ field: 'studentName', box: { x: 0.65, y: 0.12, width: 0.2, height: 0.07 } },
						{ field: 'studentNumber', box: { x: 0.12, y: 0.68, width: 0.3, height: 0.05 } }
					];
					boxes.forEach(({ box }, i) => {
						ctx.fillStyle = i ? '#0000ff' : '#ff0000';
						ctx.fillRect(
							(0.1 + 0.8 * box.x) * 1000,
							(0.1 + 0.8 * box.y) * 820,
							0.8 * box.width * 1000,
							0.8 * box.height * 820
						);
					});
					const corners = [
						{ x: 0.1, y: 0.1 },
						{ x: 0.9, y: 0.1 },
						{ x: 0.9, y: 0.9 },
						{ x: 0.1, y: 0.9 }
					];
					const crops = identityCrops(source, corners, { personalFields: boxes });
					const center = (patch) =>
						Array.from(
							patch
								.getContext('2d')
								.getImageData(Math.floor(patch.width / 2), Math.floor(patch.height / 2), 1, 1).data
						);
					let missingRejected = false;
					try {
						identityCrops(source, corners, { personalFields: [] });
					} catch {
						missingRejected = true;
					}
					return { name: center(crops.name), number: center(crops.studentNumber), missingRejected };
				},
				'/@fs/' + source('src/lib/clearance/scan.client.ts')
			);
			assert.deepEqual(cropResult, {
				name: [255, 0, 0, 255],
				number: [0, 0, 255, 255],
				missingRejected: true
			});
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			rmSync(root, { recursive: true, force: true });
		}
	}
);
