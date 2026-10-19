import { isHttpError, json } from '@sveltejs/kit';
import { getIdentityStudent, readIdentityCrops, recognizeIdentity } from '../identity.server';
import { matchIdentity } from '../identity';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	// Expected identity comes from the session/database, never from browser input.
	const student = getIdentityStudent(locals);
	const headers = { 'Cache-Control': 'private, no-store' };
	if (!student)
		return json(
			{ message: 'No student record available for this test.' },
			{ status: 404, headers }
		);
	if (request.headers.get('origin') !== url.origin)
		return json(
			{ message: 'Open the test page on this site before checking.' },
			{ status: 403, headers }
		);
	const crops = await readIdentityCrops(request);
	const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]);
	try {
		const readings = await recognizeIdentity(crops, signal);
		const result = matchIdentity(readings, student);
		if (readings.warnings) {
			result.warnings = readings.warnings;
			result.verdict = 'review';
			result.detail =
				'The handwriting model could not finish reading every field. Available details are shown; confirm against the original image.';
		}
		return json(result, { headers });
	} catch (cause) {
		// Auth/validation/busy errors retain their authored status; provider errors stay private.
		if (isHttpError(cause)) throw cause;
		return json(
			{
				message: signal.aborted
					? 'Handwriting check cancelled or timed out. Try a clearer image.'
					: 'Could not complete the handwriting check. Check Ollama is available and retry.'
			},
			{ status: signal.aborted ? 408 : 502, headers }
		);
	}
};
