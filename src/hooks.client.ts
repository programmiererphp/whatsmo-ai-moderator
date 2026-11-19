import { initDiagnostics, recordDiagnosticError } from '$lib/diagnostics/logger';
import type { HandleClientError } from '@sveltejs/kit';

if (typeof window !== 'undefined') initDiagnostics();

export const handleError: HandleClientError = ({ error, event }) => {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;

	recordDiagnosticError('sveltekit', 'client_error', error);
	console.error('[Whatsmo] Unhandled error:', { message, stack, url: event.url.pathname });

	return {
		message: 'Something went wrong',
		code: 'UNEXPECTED'
	};
};
