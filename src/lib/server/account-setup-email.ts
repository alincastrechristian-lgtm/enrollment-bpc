import { AsyncLocalStorage } from 'node:async_hooks';

// Better Auth suppresses email-callback errors. Keep the delivery result scoped
// to each staff request, including concurrent sends, without changing public recovery responses.
export const accountSetupEmailDelivery = new AsyncLocalStorage<{ sent: boolean }>();
