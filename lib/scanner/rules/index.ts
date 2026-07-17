import type { Rule } from '../types';
import { secretRules } from './secrets';
import { environmentRules } from './environment';
import { dependencyRules } from './dependencies';
import { ciRules } from './ci';
import { dockerRules } from './docker';
import { prismaRules } from './prisma';
import { nextjsRules } from './nextjs';
import { configurationRules } from './configuration';
import { advancedRules } from './advanced';
import { qualityRules } from './quality';

/**
 * The complete deterministic rule set, ordered by rule id.
 * Every rule is a pure function of the project snapshot.
 */
export const ALL_RULES: Rule[] = [
  ...secretRules,
  ...environmentRules,
  ...dependencyRules,
  ...ciRules,
  ...dockerRules,
  ...prismaRules,
  ...nextjsRules,
  ...configurationRules,
  ...advancedRules,
  ...qualityRules,
].sort((a, b) => a.id.localeCompare(b.id));

export function ruleById(id: string): Rule | undefined {
  return ALL_RULES.find((r) => r.id === id);
}
