/**
 * Keywords and patterns for offline data answers.
 * English and Hinglish keyword lists.
 */

export type OfflineQuestionType =
  | 'HOW_MANY_FINDINGS'
  | 'MOST_RISKY_MODULE'
  | 'WHAT_TO_FIX_FIRST'
  | 'LAST_SCAN'
  | 'WHAT_IS_NOT_CHECKED'
  | 'EXPLAIN_FINDING';

export const OFFLINE_KEYWORDS: Record<
  OfflineQuestionType,
  { en: string[]; hi: string[] }
> = {
  HOW_MANY_FINDINGS: {
    en: [
      'how many findings',
      'how many issues',
      'findings count',
      'number of findings',
      'count of findings',
      'total findings',
      'findings breakdown',
      'findings summary',
    ],
    hi: [
      'kitni findings',
      'kitne findings',
      'findings kitni',
      'findings kitne',
      'kitne issues',
      'kitni problems',
      'findings count kya',
      'kul kitni finding',
      'kitni finding hain',
      'kitne finding hain',
    ],
  },
  MOST_RISKY_MODULE: {
    en: [
      'most risky module',
      'riskiest module',
      'highest risk module',
      'most affected module',
      'risk module',
      'highest severity module',
      'which module is most risky',
    ],
    hi: [
      'sabse risky module',
      'sabse risk module',
      'risky module kaunsa',
      'kaunsa module risky',
      'sabse zyada risk module',
      'sabse dangerous module',
      'kaunse module mein sabse zyada',
    ],
  },
  WHAT_TO_FIX_FIRST: {
    en: [
      'what should i fix first',
      'what to fix first',
      'fix first',
      'where should i start',
      'prioritize fixes',
      'what first',
      'which finding first',
      'what to tackle first',
    ],
    hi: [
      'pehle kya theek karun',
      'pehle kya fix karun',
      'pehle kya sahi karun',
      'sabse pehle kya theek karun',
      'pehle kya karein',
      'kya theek karun pehle',
      'kahan se shuru karun',
      'sabse pehle kya fix karein',
    ],
  },
  LAST_SCAN: {
    en: [
      'when was the last scan',
      'last scan',
      'when did it scan',
      'scan time',
      'scan status',
      'last scan time',
      'when was project scanned',
    ],
    hi: [
      'scan kab hua',
      'aakhri scan kab hua',
      'last scan kab hua',
      'kab scan hua',
      'scan kab hua tha',
      'scan status kya hai',
      'pichla scan kab hua',
    ],
  },
  WHAT_IS_NOT_CHECKED: {
    en: [
      'what is not checked',
      'what is not scanned',
      'phase 1 limits',
      'what does ripple not check',
      'what is unchecked',
      'unsupported checks',
      'system limits',
      'scope limits',
    ],
    hi: [
      'kya check nahi hua',
      'kya scan nahi hua',
      'kya check nahi hota',
      'kya scan nahi hota',
      'limits kya hain',
      'kya cover nahi hota',
      'ripple kya check nahi karta',
      'kya scan nahi karta',
    ],
  },
  EXPLAIN_FINDING: {
    en: [
      'explain this finding',
      'explain finding',
      'what is this finding',
      'how to fix this finding',
      'explain this issue',
      'tell me about this finding',
    ],
    hi: [
      'ye finding samjhao',
      'finding samjhao',
      'ye finding kya hai',
      'isko samjhao',
      'finding explain karo',
      'is finding ko samjhao',
      'ye finding kaise theek karein',
    ],
  },
};

/**
 * Match a question against the offline data question keywords.
 * Returns the matched question type or null if no match.
 */
export function matchOfflineDataQuestion(
  question: string,
  isFindingScreen: boolean = false
): OfflineQuestionType | null {
  const q = question.toLowerCase().trim();

  // If on finding screen and question asks to explain finding
  if (isFindingScreen) {
    const explainKeywords = [
      ...OFFLINE_KEYWORDS.EXPLAIN_FINDING.en,
      ...OFFLINE_KEYWORDS.EXPLAIN_FINDING.hi,
    ];
    if (explainKeywords.some((k) => q.includes(k))) {
      return 'EXPLAIN_FINDING';
    }
  }

  // Check the remaining types
  const types: OfflineQuestionType[] = [
    'HOW_MANY_FINDINGS',
    'MOST_RISKY_MODULE',
    'WHAT_TO_FIX_FIRST',
    'LAST_SCAN',
    'WHAT_IS_NOT_CHECKED',
    'EXPLAIN_FINDING',
  ];

  for (const type of types) {
    const list = [
      ...OFFLINE_KEYWORDS[type].en,
      ...OFFLINE_KEYWORDS[type].hi,
    ];
    if (list.some((k) => q.includes(k))) {
      return type;
    }
  }

  return null;
}
