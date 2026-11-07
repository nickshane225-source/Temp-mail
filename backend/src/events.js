import { EventEmitter } from 'events';

// In-process event emitter for mailbox live updates
export const mailboxEvents = new EventEmitter();
// Increase listener cap for active concurrent connections
mailboxEvents.setMaxListeners(1000);
