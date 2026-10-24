export type Lang = 'en' | 'hi';

export interface HowToFixGuidance {
  whatItMeans: string;
  steps: string[];
  verify: string;
  caution?: string;
}

export const HOW_TO_FIX_DATA: Record<string, Record<Lang, HowToFixGuidance>> = {
  circular_dependency: {
    en: {
      whatItMeans:
        'Two or more files import each other, so they form a loop. This can cause values to be undefined at start-up or make the load order confusing. Ripple AI has not confirmed that it breaks anything.',
      steps: [
        'Open the files named in the evidence.',
        'Find what they share, for example a helper, a constant or a type.',
        'Move the shared part into a third file.',
        'Make both files import from the third file instead of from each other.',
        'Run your own tests, then upload and scan the project again.',
      ],
      verify: 'After a new scan, this circular dependency finding should be gone.',
    },
    hi: {
      whatItMeans:
        'Do ya zyada files ek doosre ko import karti hain, isse ek gol chakkar (loop) ban jata hai. Isse start-up par value undefined ho sakti hai ya loading ka order uljha sakta hai. Ripple AI ne ye confirm nahi kiya hai ki isse kuch toot raha hai.',
      steps: [
        'Evidence mein jo files likhi hain unhe kholo.',
        'Dekho ki dono mein kya common hai, jaise helper, constant ya type.',
        'Us common hisse ko ek teesri file mein le jao.',
        'Dono files ko ek doosre ki jagah us teesri file se import karao.',
        'Apne tests chalao, phir project dobara upload karke scan karo.',
      ],
      verify: 'Naye scan ke baad ye circular dependency wali finding nahi dikhni chahiye.',
    },
  },
  broken_import: {
    en: {
      whatItMeans:
        'A file imports a path that does not exist in the uploaded project, so that import cannot be resolved.',
      steps: [
        'Open the file and line shown in the evidence.',
        'Check the spelling of the path and the folder names.',
        'Check capital and small letters. Some systems treat Fee.js and fee.js as different files.',
        'Find out whether the target file was renamed, moved or deleted.',
        'Fix the path, or restore the missing file, then scan again.',
      ],
      verify: 'After a new scan, the broken import finding for this line should be gone.',
      caution: 'Ripple AI does not know whether this code path runs in production.',
    },
    hi: {
      whatItMeans:
        'Ek file aisa path import kar rahi hai jo upload kiye gaye project mein hai hi nahi, isliye wo import resolve nahi ho pa raha.',
      steps: [
        'Evidence mein dikhayi gayi file aur line kholo.',
        'Path aur folder ke naam ki spelling check karo.',
        'Bade aur chhote akshar check karo. Kuch systems Fee.js aur fee.js ko alag file maante hain.',
        'Pata karo ki wo file rename, move ya delete to nahi hui.',
        'Path theek karo ya missing file wapas lao, phir dobara scan karo.',
      ],
      verify: 'Naye scan ke baad is line ki broken import wali finding nahi dikhni chahiye.',
      caution: 'Ripple AI ko nahi pata ki ye code production mein chalta hai ya nahi.',
    },
  },
  isolated_file: {
    en: {
      whatItMeans:
        'No other file in the project imports or calls this file. Ripple AI cannot see use by a framework, a build tool or dynamic loading, so this is only a hypothesis.',
      steps: [
        'Search the project for the file name to see whether anything refers to it.',
        'Check package.json scripts, build and routing configuration, and framework conventions.',
        'If it is really unused, ask your team before deleting it.',
        'Commit or back up your project first, then delete or move the file.',
        'Scan again to confirm nothing else broke.',
      ],
      verify:
        'After a new scan, the file should no longer be listed, and no new broken import should appear.',
    },
    hi: {
      whatItMeans:
        'Project ki koi aur file is file ko import ya call nahi karti. Framework, build tool ya dynamic loading se hone wala use Ripple AI dekh nahi sakta, isliye ye sirf ek hypothesis hai.',
      steps: [
        'Project mein file ka naam search karo aur dekho ki koi use karta hai ya nahi.',
        'package.json ke scripts, build aur routing ki configuration, aur framework ke niyam check karo.',
        'Agar sach mein use nahi ho rahi, to delete karne se pehle apni team se poochho.',
        'Pehle project commit ya backup karo, phir file delete ya move karo.',
        'Dobara scan karo aur dekho ki kuch aur to nahi toota.',
      ],
      verify:
        'Naye scan ke baad ye file list mein nahi honi chahiye, aur koi naya broken import nahi aana chahiye.',
    },
  },
  env_undeclared: {
    en: {
      whatItMeans:
        'The code reads an environment variable that is not listed in .env.example. Other developers or the hosting platform may not know it must be set.',
      steps: [
        'Check that the variable name is spelled correctly in the code.',
        'Add the name to .env.example as NAME= with no value.',
        'Put the real value only in your own .env file or in your hosting dashboard.',
        'Never commit real values to the repository.',
        'Restart or redeploy, then scan again.',
      ],
      verify: 'After a new scan, this variable should no longer be reported as undeclared.',
      caution:
        'It may already be set in your deployment environment, which Ripple AI cannot see.',
    },
    hi: {
      whatItMeans:
        'Code ek environment variable padh raha hai jo .env.example mein likha nahi hai. Doosre developers ya hosting platform ko pata nahi hoga ki use set karna zaroori hai.',
      steps: [
        'Code mein variable ke naam ki spelling theek hai ya nahi, check karo.',
        'Naam ko .env.example mein NAAM= ki tarah jodo, bina value ke.',
        'Asli value sirf apni .env file ya hosting dashboard mein rakho.',
        'Asli values ko kabhi repository mein commit mat karo.',
        'Restart ya redeploy karo, phir dobara scan karo.',
      ],
      verify: 'Naye scan ke baad ye variable undeclared nahi dikhna chahiye.',
      caution:
        'Ho sakta hai wo tumhare deployment environment mein pehle se set ho, jo Ripple AI dekh nahi sakta.',
    },
  },
  api_unmatched_call: {
    en: {
      whatItMeans:
        'The frontend calls a URL that no backend route matches. The request may fail with 404 unless a proxy or rewrite handles it.',
      steps: [
        'Compare the URL in the evidence with your backend routes. The closest known route is shown in the likely cause.',
        'Check the HTTP method (GET, POST and so on).',
        'Check route prefixes such as app.use mounts, and any proxy or rewrite settings.',
        'Fix the URL in the frontend, or add the missing route in the backend.',
        'Test in the browser developer tools (Network tab), then scan again.',
      ],
      verify:
        'After a new scan, this unmatched call should be gone, and the request should succeed in the Network tab.',
      caution:
        'A proxy, rewrite rule or dynamic mount may already handle this URL; Ripple AI cannot see those.',
    },
    hi: {
      whatItMeans:
        'Frontend ek aisa URL call kar raha hai jis se koi backend route match nahi karta. Jab tak proxy ya rewrite use sambhal na le, request 404 de sakti hai.',
      steps: [
        'Evidence ke URL ko apne backend routes se milao. Sabse kareeb ka route likely cause mein dikhaya gaya hai.',
        'HTTP method (GET, POST aadi) check karo.',
        'Route ke prefix check karo, jaise app.use mount, aur proxy ya rewrite ki settings.',
        'Frontend mein URL theek karo, ya backend mein missing route jodo.',
        'Browser ke developer tools (Network tab) mein test karo, phir dobara scan karo.',
      ],
      verify:
        'Naye scan ke baad ye unmatched call nahi dikhni chahiye, aur Network tab mein request safal honi chahiye.',
      caution:
        'Proxy, rewrite rule ya dynamic mount pehle se ise sambhal raha ho sakta hai; Ripple AI wo dekh nahi sakta.',
    },
  },
  secret_pattern: {
    en: {
      whatItMeans:
        'Some text in the code looks like a password, key or token. Ripple AI never shows the value. If it is only a placeholder you can ignore it.',
      steps: [
        'If the value is real, treat it as exposed. Revoke or rotate it at the provider first.',
        'Remove it from the code and read it from an environment variable instead.',
        'If it was committed to git, ask a teammate how to remove it from the history, because deleting the line is not enough.',
        'Never paste the secret into this tool, a chat or a ticket.',
        'Scan again.',
      ],
      verify:
        'After a new scan, this finding should be gone, and the old key should no longer work.',
      caution: 'Ripple AI never creates an automatic fix for secrets, on purpose.',
    },
    hi: {
      whatItMeans:
        'Code mein kuch text password, key ya token jaisa dikh raha hai. Ripple AI value kabhi nahi dikhata. Agar wo sirf placeholder hai to ise ignore kar sakte ho.',
      steps: [
        'Agar value asli hai to use leak maano. Pehle provider par jaakar use revoke ya badlo.',
        'Use code se hatao aur environment variable se padho.',
        'Agar wo git mein commit ho chuki hai, to history se hatane ka tarika apne teammate se poochho, kyunki sirf line delete karna kaafi nahi hai.',
        'Secret ko is tool, chat ya ticket mein kabhi paste mat karo.',
        'Dobara scan karo.',
      ],
      verify:
        'Naye scan ke baad ye finding nahi dikhni chahiye, aur purani key kaam karna band kar deni chahiye.',
      caution: 'Ripple AI secrets ke liye jaan boojh kar koi automatic fix nahi banata.',
    },
  },
  generic: {
    en: {
      whatItMeans: 'Ripple AI has no written guidance for this kind of finding yet.',
      steps: [
        'Read the evidence and the likely cause.',
        'Open the file and line shown.',
        'Scan again after you change something.',
      ],
      verify: 'Scan again and check whether the finding is gone.',
    },
    hi: {
      whatItMeans:
        'Is tarah ki finding ke liye Ripple AI ke paas abhi likhi hui guidance nahi hai.',
      steps: [
        'Evidence aur likely cause padho.',
        'Dikhayi gayi file aur line kholo.',
        'Kuch badalne ke baad dobara scan karo.',
      ],
      verify: 'Dobara scan karo aur dekho ki finding gayi ya nahi.',
    },
  },
};

export function getHowToFix(ruleId: string, lang: Lang): HowToFixGuidance {
  const ruleData = HOW_TO_FIX_DATA[ruleId] ?? HOW_TO_FIX_DATA.generic;
  const guidance = ruleData[lang] ?? ruleData.en;
  return guidance;
}
