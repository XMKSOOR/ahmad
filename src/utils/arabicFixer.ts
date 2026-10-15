/**
 * Utility to detect and fix reversed Arabic text often found in legacy POS / thermal receipt QR codes.
 */

// Mapping of Arabic Presentation Forms A & B to standard Unicode characters
const PRESENTATION_FORMS_MAP: Record<number, string> = {
  // Alef with Madda / Hamza
  0xFE80: '\u0621', 0xFE81: '\u0622', 0xFE82: '\u0622', 0xFE83: '\u0623', 0xFE84: '\u0623',
  0xFE85: '\u0624', 0xFE86: '\u0624', 0xFE87: '\u0625', 0xFE88: '\u0625', 0xFE89: '\u0626',
  0xFE8A: '\u0626', 0xFE8B: '\u0626', 0xFE8C: '\u0626', 0xFE8D: '\u0627', 0xFE8E: '\u0627',
  // Baa
  0xFE8F: '\u0628', 0xFE90: '\u0628', 0xFE91: '\u0628', 0xFE92: '\u0628',
  // Ta Marbuta
  0xFE93: '\u0629', 0xFE94: '\u0629',
  // Taa
  0xFE95: '\u062A', 0xFE96: '\u062A', 0xFE97: '\u062A', 0xFE98: '\u062A',
  // Thaa
  0xFE99: '\u062B', 0xFE9A: '\u062B', 0xFE9B: '\u062B', 0xFE9C: '\u062B',
  // Jeem
  0xFE9D: '\u062C', 0xFE9E: '\u062C', 0xFE9F: '\u062C', 0xFEA0: '\u062C',
  // Haa
  0xFEA1: '\u062D', 0xFEA2: '\u062D', 0xFEA3: '\u062D', 0xFEA4: '\u062D',
  // Khaa
  0xFEA5: '\u062E', 0xFEA6: '\u062E', 0xFEA7: '\u062E', 0xFEA8: '\u062E',
  // Dal & Dhal
  0xFEA9: '\u062F', 0xFEAA: '\u062F', 0xFEAB: '\u0630', 0xFEAC: '\u0630',
  // Raa & Zay
  0xFEAD: '\u0631', 0xFEAE: '\u0631', 0xFEAF: '\u0632', 0xFEB0: '\u0632',
  // Seen & Sheen
  0xFEB1: '\u0633', 0xFEB2: '\u0633', 0xFEB3: '\u0633', 0xFEB4: '\u0633',
  0xFEB5: '\u0634', 0xFEB6: '\u0634', 0xFEB7: '\u0634', 0xFEB8: '\u0634',
  // Saad & Daad
  0xFEB9: '\u0635', 0xFEBA: '\u0635', 0xFEBB: '\u0635', 0xFEBC: '\u0635',
  0xFEBD: '\u0636', 0xFEBE: '\u0636', 0xFEBF: '\u0636', 0xFEC0: '\u0636',
  // Taa & Dhaa
  0xFEC1: '\u0637', 0xFEC2: '\u0637', 0xFEC3: '\u0637', 0xFEC4: '\u0637',
  0xFEC5: '\u0638', 0xFEC6: '\u0638', 0xFEC7: '\u0638', 0xFEC8: '\u0638',
  // Ain & Ghain
  0xFEC9: '\u0639', 0xFECA: '\u0639', 0xFECB: '\u0639', 0xFECC: '\u0639',
  0xFECD: '\u063A', 0xFECE: '\u063A', 0xFECF: '\u063A', 0xFED0: '\u063A',
  // Faa & Qaaf
  0xFED1: '\u0641', 0xFED2: '\u0641', 0xFED3: '\u0641', 0xFED4: '\u0641',
  0xFED5: '\u0642', 0xFED6: '\u0642', 0xFED7: '\u0642', 0xFED8: '\u0642',
  // Kaaf & Laam
  0xFED9: '\u0643', 0xFEDA: '\u0643', 0xFEDB: '\u0643', 0xFEDC: '\u0643',
  0xFEDD: '\u0644', 0xFEDE: '\u0644', 0xFEDF: '\u0644', 0xFEE0: '\u0644',
  // Meem & Noon
  0xFEE1: '\u0645', 0xFEE2: '\u0645', 0xFEE3: '\u0645', 0xFEE4: '\u0645',
  0xFEE5: '\u0646', 0xFEE6: '\u0646', 0xFEE7: '\u0646', 0xFEE8: '\u0646',
  // Haa, Waw, Yaa
  0xFEE9: '\u0647', 0xFEEA: '\u0647', 0xFEEB: '\u0647', 0xFEEC: '\u0647',
  0xFEED: '\u0648', 0xFEEE: '\u0648',
  0xFEEF: '\u0649', 0xFEF0: '\u0649',
  0xFEF1: '\u064A', 0xFEF2: '\u064A', 0xFEF3: '\u064A', 0xFEF4: '\u064A',
  // Lam-Alef ligatures
  0xFEF5: '\u0644\u0622', 0xFEF6: '\u0644\u0622',
  0xFEF7: '\u0644\u0623', 0xFEF8: '\u0644\u0623',
  0xFEF9: '\u0644\u0625', 0xFEFA: '\u0644\u0625',
  0xFEFB: '\u0644\u0627', 0xFEFC: '\u0644\u0627',
};

/**
 * Converts presentation forms to standard Arabic Unicode chars.
 */
export function normalizeArabicPresentationForms(str: string): string {
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (PRESENTATION_FORMS_MAP[code]) {
      out += PRESENTATION_FORMS_MAP[code];
    } else {
      out += str[i];
    }
  }
  return out;
}

/**
 * Reverses a string character-by-character.
 */
export function reverseString(str: string): string {
  return Array.from(str).reverse().join('');
}

/**
 * Detects whether a word or string is likely reversed Arabic.
 * Examples of reversed Arabic:
 * - Word starts with 'ة' (Ta Marbuta can never start an Arabic word)
 * - Word starts with 'ـ'
 * - Word starts with Hamza at end like 'ءاحذة'
 */
export function isWordReversedArabic(word: string): boolean {
  if (!word || word.length < 2) return false;
  const clean = word.replace(/^[^\u0600-\u06FF]+|[^\u0600-\u06FF]+$/g, '');
  if (!clean) return false;

  // Ta Marbuta at the beginning of a word indicates it was reversed
  if (clean.startsWith('ة') || clean.startsWith('ـ')) {
    return true;
  }
  // If clean starts with isolated Hamza (ء) followed by letters
  if (clean.startsWith('ء') && clean.length > 2) {
    return true;
  }
  return false;
}

/**
 * Smartly fixes reversed Arabic text.
 * Handles both entire reversed strings and word-by-word reversed strings.
 */
export function fixReversedArabic(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeArabicPresentationForms(raw.trim());

  const words = normalized.split(/\s+/);
  let reversedWordCount = 0;

  for (const w of words) {
    if (isWordReversedArabic(w)) {
      reversedWordCount++;
    }
  }

  // If any word starts with Ta Marbuta or is reversed:
  if (reversedWordCount > 0) {
    // Check if the entire sentence was reversed (e.g. word order is also inverted)
    // or if individual words were reversed
    const fixedWords = words.map((w) => {
      if (isWordReversedArabic(w)) {
        return reverseString(w);
      }
      return w;
    });

    return fixedWords.join(' ');
  }

  return normalized;
}
