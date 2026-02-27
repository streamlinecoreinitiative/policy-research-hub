/**
 * Quality Assurance Gate
 * 
 * Validates generated articles before publishing.
 * Articles must pass all checks to be auto-published.
 * Failed articles are saved as drafts and can be retried.
 */

export type QAResult = {
  passed: boolean;
  score: number;          // 0-100 overall quality score
  checks: QACheck[];
  failReasons: string[];
  suggestions: string[];  // Feedback for retry prompt
};

export type QACheck = {
  name: string;
  passed: boolean;
  weight: number;
  detail: string;
};

/**
 * Validate an article title is meaningful (not a generic section heading)
 */
function checkTitle(title: string, topic: string): QACheck {
  const genericTitles = [
    'executive summary',
    'policy brief',
    'research summary',
    'introduction',
    'overview',
    'report',
    'analysis',
    'document',
    'untitled',
    'draft',
    'brief',
  ];

  const normalized = title.toLowerCase().trim().replace(/[:\-–—]/g, '').trim();
  const isGeneric = genericTitles.some(g => normalized === g || normalized.startsWith(g + ' '));
  const isTooShort = title.trim().length < 15;
  const hasNoSubstance = !title.includes(' ') || title.split(/\s+/).length < 3;

  const passed = !isGeneric && !isTooShort && !hasNoSubstance;

  return {
    name: 'title_quality',
    passed,
    weight: 20,
    detail: isGeneric
      ? `Title "${title}" is a generic section heading, not a proper article title`
      : isTooShort
        ? `Title "${title}" is too short (${title.length} chars, minimum 15)`
        : hasNoSubstance
          ? `Title "${title}" lacks substance (needs at least 3 words)`
          : `Title is specific and descriptive`,
  };
}

/**
 * Check that the article meets minimum word count (at least 70% of target)
 */
function checkWordCount(content: string, targetWordCount: number): QACheck {
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const minimum = Math.floor(targetWordCount * 0.7);
  const passed = wordCount >= minimum;

  return {
    name: 'word_count',
    passed,
    weight: 20,
    detail: passed
      ? `Word count ${wordCount} meets minimum ${minimum} (target: ${targetWordCount})`
      : `Word count ${wordCount} is below minimum ${minimum} (target: ${targetWordCount})`,
  };
}

/**
 * Check that all required template sections are present
 */
function checkSections(content: string, requiredSections: string[]): QACheck {
  const headings = (content.match(/^##\s+(.+)$/gm) || [])
    .map(h => h.replace(/^##\s+/, '').toLowerCase().trim());

  const missing: string[] = [];
  for (const section of requiredSections) {
    const sectionLower = section.toLowerCase();
    const found = headings.some(h =>
      h.includes(sectionLower) || sectionLower.includes(h)
    );
    if (!found) missing.push(section);
  }

  const passed = missing.length === 0;
  return {
    name: 'sections_complete',
    passed,
    weight: 15,
    detail: passed
      ? `All ${requiredSections.length} required sections present`
      : `Missing sections: ${missing.join(', ')}`,
  };
}

/**
 * Check the article has enough source citations
 */
function checkSources(content: string, minimumSources: number = 3): QACheck {
  const sourcePatterns = [
    /\bWorld Bank\b/gi,
    /\bUN[\s-]?Data\b/gi,
    /\bWHO\b/gi,
    /\bFAO\b/gi,
    /\bIPCC\b/gi,
    /\bIRENA\b/gi,
    /\bIEA\b/gi,
    /\baccording to\b/gi,
    /\bsource:/gi,
    /\bcited in\b/gi,
    /\bdata from\b/gi,
  ];

  let count = 0;
  for (const pattern of sourcePatterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }

  const passed = count >= minimumSources;
  return {
    name: 'source_citations',
    passed,
    weight: 15,
    detail: passed
      ? `Found ${count} source citations (minimum: ${minimumSources})`
      : `Only ${count} source citations found (minimum: ${minimumSources})`,
  };
}

/**
 * Check the H1 title matches the article title (not a section heading)
 */
function checkH1Consistency(content: string, expectedTitle: string): QACheck {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (!h1Match) {
    return {
      name: 'h1_consistency',
      passed: false,
      weight: 10,
      detail: 'No H1 heading found in article',
    };
  }

  const h1Title = h1Match[1].trim().toLowerCase();
  const expected = expectedTitle.trim().toLowerCase();

  // Check if the H1 is just "Executive Summary" or similar generic
  const genericH1s = ['executive summary', 'policy brief', 'introduction', 'overview'];
  const isGenericH1 = genericH1s.some(g => h1Title === g);

  if (isGenericH1) {
    return {
      name: 'h1_consistency',
      passed: false,
      weight: 10,
      detail: `H1 heading is generic ("${h1Match[1]}") — should be the article title`,
    };
  }

  return {
    name: 'h1_consistency',
    passed: true,
    weight: 10,
    detail: `H1 heading is appropriate: "${h1Match[1].slice(0, 60)}..."`,
  };
}

/**
 * Check for excessive repetition (same paragraph or sentence repeated)
 */
function checkRepetition(content: string): QACheck {
  const sentences = content
    .split(/[.!?]\s+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 30);

  const seen = new Map<string, number>();
  let duplicates = 0;
  for (const s of sentences) {
    // Use first 50 chars as fingerprint
    const key = s.slice(0, 50);
    seen.set(key, (seen.get(key) || 0) + 1);
    if ((seen.get(key) || 0) > 1) duplicates++;
  }

  const ratio = duplicates / Math.max(1, sentences.length);
  const passed = ratio < 0.1; // Less than 10% repeated sentences

  return {
    name: 'no_repetition',
    passed,
    weight: 10,
    detail: passed
      ? `Low repetition (${duplicates} repeated of ${sentences.length} sentences)`
      : `High repetition: ${duplicates} repeated sentences of ${sentences.length} total (${Math.round(ratio * 100)}%)`,
  };
}

/**
 * Check the article isn't just a stub or truncated
 */
function checkNotStub(content: string): QACheck {
  const paragraphs = content
    .split(/\n\n+/)
    .filter(p => p.trim().length > 50 && !p.trim().startsWith('#'));

  const passed = paragraphs.length >= 4;
  return {
    name: 'not_a_stub',
    passed,
    weight: 10,
    detail: passed
      ? `Article has ${paragraphs.length} substantive paragraphs`
      : `Article only has ${paragraphs.length} paragraphs — likely a stub or truncated`,
  };
}

/**
 * Run the full QA validation gate on an article.
 * Returns a QAResult with pass/fail, score, and retry suggestions.
 */
export function runQAGate(params: {
  title: string;
  content: string;
  topic: string;
  targetWordCount: number;
  requiredSections: string[];
}): QAResult {
  const { title, content, topic, targetWordCount, requiredSections } = params;

  const checks: QACheck[] = [
    checkTitle(title, topic),
    checkWordCount(content, targetWordCount),
    checkSections(content, requiredSections),
    checkSources(content),
    checkH1Consistency(content, title),
    checkRepetition(content),
    checkNotStub(content),
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks
    .filter(c => c.passed)
    .reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  const failReasons = checks
    .filter(c => !c.passed)
    .map(c => c.detail);

  // Generate actionable suggestions for the retry prompt
  const suggestions: string[] = [];
  for (const check of checks) {
    if (check.passed) continue;
    switch (check.name) {
      case 'title_quality':
        suggestions.push(
          `The title must be specific and descriptive (e.g., "${topic.slice(0, 60)}..."). ` +
          `Do NOT use generic titles like "Executive Summary" or "Policy Brief".`
        );
        break;
      case 'word_count':
        suggestions.push(
          `The article is too short. Write at least ${targetWordCount} words ` +
          `with full coverage of all sections.`
        );
        break;
      case 'sections_complete':
        suggestions.push(
          `Missing required sections. Ensure the article contains all sections: ` +
          `${requiredSections.join(', ')}.`
        );
        break;
      case 'source_citations':
        suggestions.push(
          `Not enough source citations. Reference research data inline ` +
          `(e.g., "According to World Bank data...", "WHO reports that...").`
        );
        break;
      case 'h1_consistency':
        suggestions.push(
          `The H1 heading (# Title) must be the full article title, not a section name. ` +
          `Start the document with "# [Your Full Specific Title]".`
        );
        break;
      case 'no_repetition':
        suggestions.push(
          `Avoid repeating the same sentences or paragraphs. Each section should ` +
          `contain unique, substantive content.`
        );
        break;
      case 'not_a_stub':
        suggestions.push(
          `The article appears truncated or too thin. Each section needs ` +
          `at least 1-2 substantive paragraphs with specific analysis.`
        );
        break;
    }
  }

  // Must pass ALL critical checks (title, word count, sections) and score >= 60
  const criticalChecks = checks.filter(c =>
    ['title_quality', 'word_count', 'sections_complete'].includes(c.name)
  );
  const criticalsPassed = criticalChecks.every(c => c.passed);
  const passed = criticalsPassed && score >= 60;

  return { passed, score, checks, failReasons, suggestions };
}
