// Abort a wait even when a dependency does not observe the cancellation signal.
// The original promise remains handled, so late failures cannot become unhandled rejections.
export function abortable<T>(pending: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return Promise.resolve(pending);
	return new Promise<T>((resolve, reject) => {
		const aborted = () => reject(signal.reason);
		signal.addEventListener('abort', aborted, { once: true });
		Promise.resolve(pending)
			.then(resolve, reject)
			.finally(() => {
				signal.removeEventListener('abort', aborted);
			});
		if (signal.aborted) aborted();
	});
}

export async function withDeadline<T>(
	run: (signal: AbortSignal) => PromiseLike<T>,
	milliseconds: number,
	signal?: AbortSignal
): Promise<T> {
	const controller = new AbortController();
	const aborted = () => controller.abort(signal?.reason);
	const timer = setTimeout(
		() => controller.abort(new DOMException('Operation timed out.', 'TimeoutError')),
		milliseconds
	);
	signal?.addEventListener('abort', aborted, { once: true });
	try {
		if (signal?.aborted) aborted();
		controller.signal.throwIfAborted();
		return await abortable(run(controller.signal), controller.signal);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', aborted);
	}
}

export const CLEARANCE_CHECK_TIMEOUT_MS = 180_000;
export const CLEARANCE_CLIENT_TIMEOUT_MS = 210_000;
