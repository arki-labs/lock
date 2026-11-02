import { defineId } from '@arki/contracts';
/** A distinct owner for one acquisition attempt, never a resource key. */
export const lockToken = defineId('', {
    kind: 'lock.owner',
    format: { alphabet: 'abcdefghijklmnopqrstuvwxyz0123456789', length: 24 },
});
//# sourceMappingURL=identities.js.map