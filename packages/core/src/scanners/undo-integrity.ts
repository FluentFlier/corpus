export type UndoCapability = 'REVERSIBLE' | 'BEST_EFFORT' | 'IRREVERSIBLE';

export interface UndoCheckResult {
  capability: UndoCapability;
  message: string;
}

const IRREVERSIBLE = [
  'send_email', 'send_sms', 'send_message', 'post_tweet', 'publish_post',
  'post_to_linkedin', 'make_payment', 'transfer_funds', 'charge_card',
  'delete_account', 'deactivate_account', 'notify_user', 'send_notification',
  'submit_form', 'place_order',
];

const BEST_EFFORT = [
  'create_calendar_event', 'share_document', 'invite_user',
  'update_record', 'publish_article', 'grant_access',
];

/**
 * Checks whether an action can actually be undone.
 */
export function checkUndoIntegrity(
  actionType: string,
  hasUndoFn: boolean
): UndoCheckResult {
  const lower = actionType.toLowerCase();

  for (const action of IRREVERSIBLE) {
    if (lower.startsWith(action)) {
      return {
        capability: 'IRREVERSIBLE',
        message: hasUndoFn
          ? `'${actionType}' has an undo function but the action is irreversible (e.g., email already delivered).`
          : `'${actionType}' is irreversible and no undo function was provided.`,
      };
    }
  }

  for (const action of BEST_EFFORT) {
    if (lower.startsWith(action)) {
      return {
        capability: 'BEST_EFFORT',
        message: `'${actionType}' can be partially undone but side effects (notifications, cache) may persist.`,
      };
    }
  }

  return {
    capability: hasUndoFn ? 'REVERSIBLE' : 'BEST_EFFORT',
    message: hasUndoFn ? '' : `'${actionType}' appears reversible but no undo function was provided.`,
  };
}
