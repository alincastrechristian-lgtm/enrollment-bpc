import { mkdirSync, writeFileSync } from 'node:fs';
import { createCORPdf } from '../src/lib/server/cor-pdf.ts';
import type { CertificateOfRegistration } from '../src/lib/server/cor.ts';

// Fictional data only. Use the same renderer as authenticated COR downloads.
const example: CertificateOfRegistration = {
	student: {
		studentId: 'SAMPLE-000001',
		name: 'SAMPLE STUDENT - NOT VALID FOR REGISTRATION',
		birthDate: '2003-02-20',
		sex: 'female',
		address: '123 Example Street, Malolos, Bulacan (fictional address)',
		email: 'student@example.com',
		contactNumber: 'Not provided (example)'
	},
	enrollment: {
		id: 'example-enrollment',
		programCode: 'BSIS',
		programName: 'Bachelor of Science in Information Systems',
		schoolYearStart: 2026,
		semester: 1,
		yearLevel: 4,
		section: 'A',
		status: 'enrolled'
	},
	subjects: [
		{ code: 'IS-OJT 418', name: 'INTERNSHIP / PRACTICUM (500 HOURS)', units: 9 },
		{ code: 'IS-Cap1 413', name: 'CAPSTONE PROJECT 1', units: 3 }
	]
};

const directory = new URL('../docs/examples/', import.meta.url);
mkdirSync(directory, { recursive: true });
const filename = new URL('certificate-of-registration-compact.pdf', directory);
writeFileSync(filename, await createCORPdf(example, new Date('2026-10-17T00:00:00Z')));
console.log('Created docs/examples/certificate-of-registration-compact.pdf');
