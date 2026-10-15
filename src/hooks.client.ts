import { getPublicError } from '#lib/errors.js';
import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = getPublicError;
