export interface IsolationCheckResult {
  isolated: boolean;
  foreignUserIds: string[];
  foreignNamespaces: string[];
  message: string;
}

/**
 * Checks that no content from other users is in the current context.
 */
export function checkContextIsolation(
  currentUserId: string,
  contextUserIds: string[],
  memoryNamespaces?: string[]
): IsolationCheckResult {
  const foreignUsers = contextUserIds.filter((id) => id !== currentUserId);
  const foreignNs = (memoryNamespaces ?? []).filter(
    (ns) => !ns.toLowerCase().includes(currentUserId.toLowerCase())
  );

  if (foreignUsers.length > 0) {
    return {
      isolated: false,
      foreignUserIds: foreignUsers,
      foreignNamespaces: foreignNs,
      message: `Cross-user contamination: context contains data from user(s) ${foreignUsers.join(', ')}`,
    };
  }

  if (foreignNs.length > 0) {
    return {
      isolated: false,
      foreignUserIds: [],
      foreignNamespaces: foreignNs,
      message: `Memory from non-user namespaces: ${foreignNs.join(', ')}`,
    };
  }

  return { isolated: true, foreignUserIds: [], foreignNamespaces: [], message: '' };
}
