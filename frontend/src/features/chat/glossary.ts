/**
 * Glossary and offline answer helper.
 * Pure – no React, no side-effects, no AI calls.
 *
 * Design:
 * - offlineAnswer() always returns plain text (never claims AI wrote it).
 * - Term matching: lowercase substring search over term.id and synonym arrays.
 * - Finding guidance: uses getHowToFix() when a rule_id is available.
 */
import type { ChatLang, ContextIds } from './types.js';
import { getHowToFix } from '../investigations/howToFix.js';

export interface GlossaryEntry {
  id: string;
  /** Short canonical term label shown to the user */
  label: string;
  labelHi: string;
  /** One-line definition in English */
  meaning: string;
  /** One-line definition in Hinglish */
  meaningHi: string;
  /** Tiny concrete example in English */
  example: string;
  /** Tiny concrete example in Hinglish */
  exampleHi: string;
  /** Optional synonym/alternate spellings for matching */
  synonyms?: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'circular_dependency',
    label: 'Circular dependency',
    labelHi: 'Circular dependency',
    meaning: 'Two or more files import each other, forming a loop.',
    meaningHi: 'Do ya zyada files ek doosre ko import karti hain, ek gol chakkar banta hai.',
    example: 'a.js imports b.js, and b.js imports a.js.',
    exampleHi: 'a.js ne b.js ko import kiya, aur b.js ne a.js ko – gol chakkar!',
    synonyms: ['circular', 'circular dep', 'gol chakkar', 'loop import'],
  },
  {
    id: 'broken_import',
    label: 'Broken import',
    labelHi: 'Broken import',
    meaning: 'An import statement points to a file that does not exist in the project.',
    meaningHi: 'Import statement ek aisi file ko point kar raha hai jo project mein hai hi nahi.',
    example: `import { foo } from './helpers'; // helpers.js is missing`,
    exampleHi: `import { foo } from './helpers'; // helpers.js milti hi nahi`,
    synonyms: ['broken import', 'missing import', 'unresolved import', 'tuta import'],
  },
  {
    id: 'isolated_file',
    label: 'Isolated file',
    labelHi: 'Isolated file',
    meaning: 'A file that nothing else in the project imports or calls.',
    meaningHi: 'Ek aisi file jise project ki koi aur file import ya call nahi karti.',
    example: 'legacy.js has zero incoming imports and is not referenced anywhere.',
    exampleHi: 'legacy.js ko koi nahi bulate – zero incoming imports.',
    synonyms: ['isolated', 'unreferenced', 'dead file', 'unused file', 'akela file'],
  },
  {
    id: 'unresolved_edge',
    label: 'Unresolved edge',
    labelHi: 'Unresolved edge',
    meaning: 'A dependency link whose target cannot be statically determined (e.g. dynamic imports).',
    meaningHi: 'Aisi dependency jiska target statically pata nahi chal sakta, jaise dynamic import.',
    example: 'const mod = require(condition ? "a" : "b"); // target unclear',
    exampleHi: 'Dynamic require – Ripple AI pata nahi laga sakta kaunsi file load hogi.',
    synonyms: ['unresolved', 'dynamic import', 'uncertain edge'],
  },
  {
    id: 'environment_variable',
    label: 'Environment variable',
    labelHi: 'Environment variable',
    meaning: 'A named value injected from outside the code, e.g. API keys or config flags.',
    meaningHi: 'Code ke bahar se aane wala naam-wala value, jaise API key ya config.',
    example: 'process.env.DATABASE_URL – set in .env, not hard-coded.',
    exampleHi: 'process.env.DATABASE_URL – .env mein set hota hai, code mein nahi likha.',
    synonyms: ['env var', 'environment var', 'process.env', '.env', 'env variable', 'env'],
  },
  {
    id: 'api_endpoint',
    label: 'API endpoint',
    labelHi: 'API endpoint',
    meaning: 'A URL that a server exposes to receive and respond to requests.',
    meaningHi: 'Server ka ek URL jo requests sunne ke liye available hota hai.',
    example: 'GET /api/users – returns the list of users as JSON.',
    exampleHi: 'GET /api/users – users ki list JSON mein deta hai.',
    synonyms: ['endpoint', 'api route', 'route endpoint', 'api url'],
  },
  {
    id: 'route',
    label: 'Route',
    labelHi: 'Route',
    meaning: 'A mapping from a URL pattern and HTTP method to a handler function.',
    meaningHi: 'URL pattern aur HTTP method ko ek handler function se map karna.',
    example: 'app.get("/login", loginHandler)',
    exampleHi: 'app.get("/login", loginHandler) – GET /login aane par loginHandler chalta hai.',
    synonyms: ['route', 'api route', 'http route', 'express route'],
  },
  {
    id: 'module',
    label: 'Module',
    labelHi: 'Module',
    meaning: 'A self-contained unit of code; in Node.js each file is a module.',
    meaningHi: 'Code ka ek apne-aap mein pura hissa; Node.js mein har file ek module hai.',
    example: 'fees.js is a module that exports feeService.',
    exampleHi: 'fees.js ek module hai jo feeService export karta hai.',
    synonyms: ['module', 'node module', 'js module'],
  },
  {
    id: 'node',
    label: 'Node (graph)',
    labelHi: 'Node (graph)',
    meaning: 'A single element in the dependency graph (file, module, API, database, etc.).',
    meaningHi: 'Dependency graph mein ek element – file, module, API, database, etc.',
    example: 'The "Fees" module node links to its route and service nodes.',
    exampleHi: '"Fees" module node apne route aur service nodes se juda hai.',
    synonyms: ['node', 'graph node', 'vertex'],
  },
  {
    id: 'edge',
    label: 'Edge (graph)',
    labelHi: 'Edge (graph)',
    meaning: 'A link between two nodes representing a dependency or relationship.',
    meaningHi: 'Do nodes ke beech ka link jo dependency ya rishta dikhata hai.',
    example: 'An edge from NoticePage.tsx to noticeService.js means the page imports the service.',
    exampleHi: 'NoticePage.tsx se noticeService.js ka edge matlab page ne service import ki.',
    synonyms: ['edge', 'link', 'dependency link', 'arrow'],
  },
  {
    id: 'dependency_graph',
    label: 'Dependency graph',
    labelHi: 'Dependency graph',
    meaning: 'A visual map of how files, modules, and services depend on each other.',
    meaningHi: 'Files, modules aur services ki dependencies ka visual naksha.',
    example: 'The L1 graph shows modules; zoom in to see individual files.',
    exampleHi: 'L1 graph mein modules dikhte hain; zoom in karo files dekhne ke liye.',
    synonyms: ['dependency graph', 'dep graph', 'graph', 'import graph'],
  },
  {
    id: 'severity',
    label: 'Severity',
    labelHi: 'Severity',
    meaning: 'How serious a finding is: critical, high, medium, low, or unknown.',
    meaningHi: 'Finding kitni gambhir hai: critical, high, medium, low ya unknown.',
    example: 'A broken import in a critical path is severity: high.',
    exampleHi: 'Critical path mein broken import ka severity high hota hai.',
    synonyms: ['severity', 'seriousness', 'gambhirta'],
  },
  {
    id: 'confidence',
    label: 'Confidence',
    labelHi: 'Confidence',
    meaning: 'How certain Ripple AI is about a finding: confirmed, likely, or hypothesis.',
    meaningHi: 'Ripple AI ko finding ke baare mein kitna yakeen hai: confirmed, likely ya hypothesis.',
    example: 'A circular dependency proven by static analysis is confidence: confirmed.',
    exampleHi: 'Static analysis se prove hua circular dep → confidence: confirmed.',
    synonyms: ['confidence', 'certainty', 'yakeen'],
  },
  {
    id: 'verification',
    label: 'Verification',
    labelHi: 'Verification',
    meaning: 'The testing status of a finding: not_tested, reproduced, fix_proposed, or fix_verified.',
    meaningHi: 'Finding ki testing status: not_tested, reproduced, fix_proposed ya fix_verified.',
    example: 'Verification changes to fix_proposed after a patch is generated.',
    exampleHi: 'Patch generate hone ke baad verification fix_proposed ho jata hai.',
    synonyms: ['verification', 'verification status', 'tested status'],
  },
  {
    id: 'hypothesis',
    label: 'Hypothesis',
    labelHi: 'Hypothesis',
    meaning: 'A finding the tool suspects but cannot confirm with the available static evidence.',
    meaningHi: 'Aisi finding jis par tool ko shak hai par static evidence se confirm nahi ho sakti.',
    example: 'An isolated file is confidence: hypothesis because dynamic loading may use it.',
    exampleHi: 'Isolated file hypothesis hai kyunki dynamic loading use kar sakta hai.',
    synonyms: ['hypothesis', 'suspected', 'shak', 'possible finding'],
  },
  {
    id: 'likely',
    label: 'Likely',
    labelHi: 'Likely',
    meaning: 'A finding with strong evidence but not 100 % certain.',
    meaningHi: 'Aisi finding jinke baare mein strong evidence hai lekin 100% pakka nahi.',
    example: 'An unmatched API call is confidence: likely unless a proxy handles it.',
    exampleHi: 'Unmatched API call likely hai jab tak proxy handle na kare.',
    synonyms: ['likely', 'probable', 'sambhavit'],
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    labelHi: 'Confirmed',
    meaning: 'A finding proven by static evidence alone (e.g. circular dependency via SCC).',
    meaningHi: 'Static evidence se prove hue finding (jaise SCC se circular dep).',
    example: 'circular_dependency is always confidence: confirmed because SCC is deterministic.',
    exampleHi: 'circular_dependency hamesha confirmed hota hai kyunki SCC deterministic hai.',
    synonyms: ['confirmed', 'pakka', 'certain'],
  },
  {
    id: 'fix_proposed',
    label: 'Fix proposed',
    labelHi: 'Fix proposed',
    meaning: 'A diff/patch has been generated for the finding but not yet applied.',
    meaningHi: 'Finding ke liye diff/patch ban gaya hai par apply nahi hua abhi.',
    example: 'After clicking "Generate fix", verification becomes fix_proposed.',
    exampleHi: '"Generate fix" click karne ke baad verification fix_proposed ho jata hai.',
    synonyms: ['fix proposed', 'patch generated', 'fix ready'],
  },
  {
    id: 'static_analysis',
    label: 'Static analysis',
    labelHi: 'Static analysis',
    meaning: 'Examining code by reading it without running it.',
    meaningHi: 'Code ko bina chalaye padhkar analyse karna.',
    example: 'Ripple AI reads your import statements but never executes your code.',
    exampleHi: 'Ripple AI sirf import statements padhta hai, code kabhi nahi chalata.',
    synonyms: ['static analysis', 'static', 'without executing'],
  },
  {
    id: 'evidence',
    label: 'Evidence',
    labelHi: 'Evidence',
    meaning: 'The specific file, line, or code pattern that led to a finding.',
    meaningHi: 'Woh specific file, line ya code pattern jo finding ka karan bana.',
    example: 'Evidence: fees.js line 12 imports a non-existent file.',
    exampleHi: 'Evidence: fees.js line 12 ne aisi file import ki jo hai nahi.',
    synonyms: ['evidence', 'saboot', 'proof', 'sabuut'],
  },
  {
    id: 'finding',
    label: 'Finding',
    labelHi: 'Finding',
    meaning: 'A potential problem detected by a Ripple AI check, with evidence.',
    meaningHi: 'Ripple AI ke check se mili ek sambhavit samasya, saboot ke saath.',
    example: 'Finding: broken_import in fees.js severity: high.',
    exampleHi: 'Finding: fees.js mein broken_import, severity: high.',
    synonyms: ['finding', 'issue', 'problem', 'alert', 'samasya'],
  },
  {
    id: 'impact',
    label: 'Impact',
    labelHi: 'Impact',
    meaning: 'Which other files or modules are affected when a specific node changes.',
    meaningHi: 'Koi ek node badla to kaun kaun si files ya modules affect hongi.',
    example: 'Changing feeService.js impacts fees.js and any callers of fees routes.',
    exampleHi: 'feeService.js badla to fees.js aur baaki callers affect honge.',
    synonyms: ['impact', 'change impact', 'affected', 'ripple effect', 'prabhav'],
  },
  {
    id: 'ripple',
    label: 'Ripple',
    labelHi: 'Ripple',
    meaning: 'The spreading effect when one module change propagates to dependent modules.',
    meaningHi: 'Ek module ka badlav doosre dependent modules tak failna.',
    example: 'A change in db.js can ripple to every service that calls it.',
    exampleHi: 'db.js mein badlav har us service tak jaata hai jo use call kare.',
    synonyms: ['ripple', 'ripple effect', 'cascading', 'failav'],
  },
  {
    id: 'round',
    label: 'Round (scan)',
    labelHi: 'Round (scan)',
    meaning: 'One complete pass of analysis over the uploaded project.',
    meaningHi: 'Uploaded project par ek poori analysis pass.',
    example: 'Upload, then click Scan to start a new round.',
    exampleHi: 'Upload karo, phir Scan dabao – ek naya round shuru hoga.',
    synonyms: ['round', 'scan round', 'pass', 'analysis pass'],
  },
  {
    id: 'regression',
    label: 'Regression',
    labelHi: 'Regression',
    meaning: 'A previously working feature that breaks after a new change.',
    meaningHi: 'Pehle kaam karne wali cheez jo naye badlav ke baad toot gayi.',
    example: 'Fixing the login route caused a regression in the marks route.',
    exampleHi: 'Login route theek kiya to marks route mein regression aa gayi.',
    synonyms: ['regression', 'breakage', 'broke again', 'toot gayi'],
  },
  {
    id: 'cors',
    label: 'CORS',
    labelHi: 'CORS',
    meaning: 'Cross-Origin Resource Sharing — browser policy that controls cross-domain API calls.',
    meaningHi: 'Cross-Origin Resource Sharing – browser niyam jo cross-domain API calls control karta hai.',
    example: 'A CORS error means the backend did not allow the frontend\'s origin.',
    exampleHi: 'CORS error matlab backend ne frontend ki origin allow nahi ki.',
    synonyms: ['cors', 'cross origin', 'cross-origin', 'access-control'],
  },
  {
    id: '404',
    label: '404 Not Found',
    labelHi: '404 Not Found',
    meaning: 'HTTP status: the server could not find the requested resource.',
    meaningHi: 'HTTP status: server requested resource dhundh nahi paya.',
    example: 'GET /api/users/999 returns 404 if user 999 does not exist.',
    exampleHi: 'GET /api/users/999 → 404 agar user 999 nahi hai.',
    synonyms: ['404', 'not found', 'missing route'],
  },
  {
    id: '500',
    label: '500 Internal Server Error',
    labelHi: '500 Internal Server Error',
    meaning: 'HTTP status: an unexpected error occurred on the server.',
    meaningHi: 'HTTP status: server par koi unexpected error aayi.',
    example: 'An unhandled exception in a route handler returns 500.',
    exampleHi: 'Route handler mein unhandled exception → 500 aata hai.',
    synonyms: ['500', 'server error', 'internal error'],
  },
  {
    id: 'jwt',
    label: 'JWT',
    labelHi: 'JWT',
    meaning: 'JSON Web Token — a compact token encoding claims, signed so the server can verify it.',
    meaningHi: 'JSON Web Token – ek compact token jo claims encode karta hai, server verify kar sakta hai.',
    example: 'Authorization: Bearer <jwt> header is used in most REST APIs.',
    exampleHi: 'Authorization: Bearer <jwt> header REST API mein authentication ke liye use hota hai.',
    synonyms: ['jwt', 'json web token', 'bearer token', 'auth token'],
  },
  {
    id: 'secret',
    label: 'Secret / credential',
    labelHi: 'Secret / credential',
    meaning: 'A sensitive value like an API key, password, or private key that must never be committed.',
    meaningHi: 'Sensitive value jaise API key, password ya private key – kabhi commit nahi karna.',
    example: 'STRIPE_SECRET_KEY=sk_live_... in a .env file (never commit this).',
    exampleHi: 'STRIPE_SECRET_KEY=sk_live_... .env mein (kabhi commit mat karo).',
    synonyms: ['secret', 'credential', 'api key', 'private key', 'raaz', 'password'],
  },
  {
    id: 'dotenv',
    label: '.env file',
    labelHi: '.env file',
    meaning: 'A file listing environment variable names and their values, kept out of version control.',
    meaningHi: 'Environment variable names aur values wali file, git se bahar rakhi jaati hai.',
    example: '.env: DATABASE_URL=postgres://localhost:5432/mydb',
    exampleHi: '.env: DATABASE_URL=postgres://localhost:5432/mydb (gitignore mein dalo)',
    synonyms: ['.env', 'dotenv', 'env file', 'env config'],
  },
  {
    id: 'package_json',
    label: 'package.json',
    labelHi: 'package.json',
    meaning: 'The Node.js project manifest listing name, version, scripts, and dependencies.',
    meaningHi: 'Node.js project ka manifest – naam, version, scripts aur dependencies.',
    example: '"scripts": { "start": "node server.js" }',
    exampleHi: '"scripts": { "start": "node server.js" } – npm start chalane ke liye.',
    synonyms: ['package.json', 'package json', 'manifest'],
  },
  {
    id: 'import',
    label: 'Import statement',
    labelHi: 'Import statement',
    meaning: 'A line of code that loads a module or value from another file.',
    meaningHi: 'Code ki ek line jo doosri file se module ya value load karta hai.',
    example: "import { Router } from 'express';",
    exampleHi: "import { Router } from 'express'; – express se Router le rahe hain.",
    synonyms: ['import', 'import statement', 'require', 'import karna'],
  },
  {
    id: 'export',
    label: 'Export statement',
    labelHi: 'Export statement',
    meaning: 'A line of code that makes a value or function available to other files.',
    meaningHi: 'Code ki ek line jo value ya function doosri files ke liye available karta hai.',
    example: 'export default router; // other files can now import this router',
    exampleHi: 'export default router; – ab doosri files is router ko import kar sakti hain.',
    synonyms: ['export', 'export statement', 'module.exports', 'export karna'],
  },
  {
    id: 'async',
    label: 'Async / await',
    labelHi: 'Async / await',
    meaning: 'JavaScript syntax for writing asynchronous code that waits for Promises.',
    meaningHi: 'JavaScript syntax jo Promises ka wait karte hue asynchronous code likhne deta hai.',
    example: 'const data = await fetch(url).then(r => r.json());',
    exampleHi: 'await se Promise ka result milta hai bina callback ke.',
    synonyms: ['async', 'await', 'promise', 'async await', 'asynchronous'],
  },
  {
    id: 'middleware',
    label: 'Middleware',
    labelHi: 'Middleware',
    meaning: 'A function that processes requests between the client and the route handler.',
    meaningHi: 'Ek function jo client aur route handler ke beech mein request process karta hai.',
    example: 'app.use(authMiddleware) checks the JWT before every route.',
    exampleHi: 'app.use(authMiddleware) – har route se pehle JWT check karta hai.',
    synonyms: ['middleware', 'express middleware', 'interceptor'],
  },
  {
    id: 'database_model',
    label: 'Database model',
    labelHi: 'Database model',
    meaning: 'A code representation of a database table or collection with its schema and queries.',
    meaningHi: 'Database table ya collection ka code representation – schema aur queries ke saath.',
    example: 'Notice.js defines the Notice schema and find/create methods.',
    exampleHi: 'Notice.js mein Notice schema aur find/create methods hain.',
    synonyms: ['model', 'database model', 'schema', 'orm model', 'db model'],
  },
];

/** Build a lowercase search index from id, synonyms, and label */
const searchIndex: Array<{ entry: GlossaryEntry; keys: string[] }> = GLOSSARY.map(
  (entry) => ({
    entry,
    keys: [
      entry.id.toLowerCase(),
      entry.label.toLowerCase(),
      entry.labelHi.toLowerCase(),
      ...(entry.synonyms ?? []).map((s) => s.toLowerCase()),
    ],
  })
);

/**
 * Find glossary entries that match the question text.
 * Matching: any key is a substring of the lowercased question.
 */
export function matchGlossaryEntries(question: string): GlossaryEntry[] {
  const q = question.toLowerCase();
  return searchIndex
    .filter(({ keys }) => keys.some((k) => q.includes(k)))
    .map(({ entry }) => entry);
}

export function hasGlossaryMatch(question: string): boolean {
  return matchGlossaryEntries(question).length > 0;
}

/**
 * Format a single glossary entry into human-readable plain text.
 */
function formatEntry(entry: GlossaryEntry, lang: ChatLang): string {
  const label = lang === 'hi' ? entry.labelHi : entry.label;
  const meaning = lang === 'hi' ? entry.meaningHi : entry.meaning;
  const example = lang === 'hi' ? entry.exampleHi : entry.example;
  return `${label}: ${meaning}\nExample: ${example}`;
}

/**
 * offlineAnswer – returns a plain-text offline answer.
 * Never claims AI wrote it.
 *
 * Logic:
 * 1. Match glossary terms by substring.
 * 2. If a finding rule_id is in ctx and findingRuleId is provided, append howToFix guidance.
 * 3. If no match, return a helpful default with 3 example questions.
 */
export function offlineAnswer(
  question: string,
  ctx: Pick<ContextIds, 'screen'> & { rule_id?: string },
  lang: ChatLang = 'en',
  findingRuleId?: string,
): string {
  const matched = matchGlossaryEntries(question);
  const lines: string[] = [];

  if (matched.length > 0) {
    lines.push(
      lang === 'hi'
        ? 'Offline help – ye jawaab AI se nahi hai:'
        : 'Offline help – this answer is not from AI:'
    );
    for (const entry of matched.slice(0, 3)) {
      lines.push('');
      lines.push(formatEntry(entry, lang));
    }
  }

  // Append howToFix guidance if we have a rule context
  const ruleId = findingRuleId ?? ctx.rule_id;
  if (ruleId) {
    const guidance = getHowToFix(ruleId, lang);
    if (matched.length === 0) {
      lines.push(
        lang === 'hi'
          ? 'Offline help – ye jawaab AI se nahi hai:'
          : 'Offline help – this answer is not from AI:'
      );
    }
    lines.push('');
    lines.push(
      lang === 'hi'
        ? `Fix guidance (${ruleId}):`
        : `Fix guidance for "${ruleId}":`
    );
    lines.push(guidance.whatItMeans);
    if (guidance.steps.length > 0) {
      lines.push(
        lang === 'hi' ? 'Steps:' : 'Steps:'
      );
      guidance.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
    lines.push(
      lang === 'hi'
        ? `Verify: ${guidance.verify}`
        : `Verify: ${guidance.verify}`
    );
    if (guidance.caution) {
      lines.push(
        lang === 'hi'
          ? `Note: ${guidance.caution}`
          : `Note: ${guidance.caution}`
      );
    }
  }

  if (lines.length === 0) {
    // Default fallback with 3 example questions
    const examples =
      lang === 'hi'
        ? [
            '"circular dependency kya hai"',
            '"broken import kaise theek karein"',
            '"severity aur confidence mein kya fark hai"',
          ]
        : [
            '"What is a circular dependency?"',
            '"How do I fix a broken import?"',
            '"What is the difference between severity and confidence?"',
          ];
    const intro =
      lang === 'hi'
        ? 'Offline help kisi bhi glossary term ke liye kaam karta hai. In sawaalon mein se ek try karo:'
        : 'Offline help works for any glossary term. Try asking one of these:';
    return `${intro}\n\n${examples.join('\n')}`;
  }

  return lines.join('\n');
}
