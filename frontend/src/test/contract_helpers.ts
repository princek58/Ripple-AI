/**
 * Contract test helper for comparing key sets between live API responses and captured fixtures.
 */
export interface KeyComparisonResult {
  matching: boolean;
  differences: string[];
}

export function compareKeySets(actual: unknown, expected: unknown, path = 'root'): KeyComparisonResult {
  const differences: string[] = [];

  function walk(act: any, exp: any, currentPath: string): void {
    if (act === null || exp === null || typeof act !== 'object' || typeof exp !== 'object') {
      return;
    }

    if (Array.isArray(act) !== Array.isArray(exp)) {
      differences.push(`${currentPath}: type mismatch (array vs object)`);
      return;
    }

    if (Array.isArray(act)) {
      if (act.length > 0 && exp.length > 0) {
        walk(act[0], exp[0], `${currentPath}[0]`);
      }
      return;
    }

    const actKeys = Object.keys(act).sort();
    const expKeys = Object.keys(exp).sort();

    const missing = expKeys.filter((k) => !actKeys.includes(k));
    const extra = actKeys.filter((k) => !expKeys.includes(k));

    if (missing.length > 0) {
      differences.push(`${currentPath}: missing keys [${missing.join(', ')}]`);
    }
    if (extra.length > 0) {
      differences.push(`${currentPath}: extra keys [${extra.join(', ')}]`);
    }

    // Walk common child object properties
    for (const key of expKeys) {
      if (key in act && act[key] !== null && typeof act[key] === 'object') {
        walk(act[key], exp[key], `${currentPath}.${key}`);
      }
    }
  }

  walk(actual, expected, path);
  return {
    matching: differences.length === 0,
    differences,
  };
}
