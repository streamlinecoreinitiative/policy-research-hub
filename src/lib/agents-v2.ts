import fs from 'fs/promises';
import path from 'path';
import { callOllamaChat, ChatMessage } from './ollama';
import { fetchPublicData } from './dataSources';
import { conductResearch, formatResearchForPrompt, ResearchData } from './webSearch';
import { getTemplate, ReportTemplate, templates } from './templates';
import { generateHTMLReport } from './htmlReport';
import { indexArticle } from './articleIndex';
import { runQAGate, QAResult } from './qaGate';
import { generateSocialPosts } from './socialPostAgent';
import { addLogEntry } from './processLog';

const OUTPUT_DIR = path.join(process.cwd(), 'data/output');
const RECENT_TITLES_PATH = path.join(process.cwd(), 'data/recent_titles.json');
const RECENT_OUTLINES_PATH = path.join(process.cwd(), 'data/recent_outlines.json');
const DEFAULT_BANNED = ['solar-powered wells', 'rainwater harvesting ponds'];

export type AgentRunParams = {
  topic: string;
  plannerModel: string;
  writerModel: string;
  factCheckerModel?: string;
  templateId?: string;
  researchDepth?: 'quick' | 'standard' | 'deep';
  customInstructions?: string;
};

export type AgentRunResult = {
  articlePath: string;
  articlePathHTML: string;
  articleTitle: string;
  articleContent: string;
  articleContentHTML: string;
  log: string;
  warnings: string[];
  research?: ResearchData;
  qualityScore?: {
    sourcesUsed: number;
    wordCount: number;
    sectionsComplete: number;
    readabilityScore: number;
  };
  qaResult?: QAResult;
  status: 'published' | 'draft';
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'draft';
}

function timestamp() {
  return new Date().toISOString();
}

function deriveTitle(content: string, topic: string) {
  const heading = content.split('\n').find((line) => line.trim().startsWith('#'));
  if (heading) {
    const title = heading.replace(/^#+\s*/, '').trim();
    // Reject generic section headings as titles
    const genericTitles = ['executive summary', 'policy brief', 'introduction', 'overview', 'report', 'analysis', 'conclusion', 'background'];
    if (genericTitles.some(g => title.toLowerCase() === g || title.toLowerCase().startsWith(g + ':'))) {
      // Try finding a more specific title in bold text or second heading
      const boldMatch = content.match(/\*\*([^*]{20,120})\*\*/);
      if (boldMatch) return boldMatch[1].trim();
      // Fallback to topic-based title
      return '';
    }
    return title;
  }
  return '';
}

function extractPlannerTitle(plan: string) {
  const match = plan.match(/title\s*[:\-]\s*(.+)/i);
  if (match?.[1]) return match[1].trim();
  return '';
}

async function readRecentTitles() {
  try {
    const raw = await fs.readFile(RECENT_TITLES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string');
    return [];
  } catch {
    return [];
  }
}

async function recordTitle(title: string) {
  const recent = await readRecentTitles();
  const next = [title, ...recent.filter((t) => t !== title)].slice(0, 12);
  await fs.mkdir(path.dirname(RECENT_TITLES_PATH), { recursive: true });
  await fs.writeFile(RECENT_TITLES_PATH, JSON.stringify(next, null, 2), 'utf8');
}

async function readRecentOutlines() {
  try {
    const raw = await fs.readFile(RECENT_OUTLINES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string');
    return [];
  } catch {
    return [];
  }
}

async function recordOutline(outline: string) {
  const recent = await readRecentOutlines();
  const next = [outline, ...recent.filter((t) => t !== outline)].slice(0, 10);
  await fs.mkdir(path.dirname(RECENT_OUTLINES_PATH), { recursive: true });
  await fs.writeFile(RECENT_OUTLINES_PATH, JSON.stringify(next, null, 2), 'utf8');
}

function fallbackTitle(baseTheme: string) {
  const regions = ['Sahel', 'Andean highlands', 'Mekong basin', 'Horn of Africa', 'Caribbean SIDS', 'Pacific SIDS', 'Indus watershed', 'Lower Mekong delta', 'Great Lakes region', 'Central America dry corridor', 'Ganges-Brahmaputra delta', 'Sudano-Sahelian belt'];
  const levers = [
    'climate-smart irrigation cooperatives',
    'mangrove restoration and blue carbon finance',
    'micro-insurance for smallholder drought risk',
    'early-warning systems and last-mile alerts',
    'climate-resilient school feeding supply chains',
    'clean cooking transition for peri-urban households',
    'flood-resilient transport corridors',
    'solar cold-chain for fisheries',
    'watershed co-management with indigenous councils',
    'urban heat mitigation through cool roofs',
    'agroforestry value chains for cash crops',
    'microgrids for rural clinics',
    'nature-based solutions for landslide risk',
    'water loss reduction in secondary cities'
  ];
  const outcomes = [
    'protecting livelihoods under climate stress',
    'cutting disaster losses for vulnerable groups',
    'stabilizing food security during droughts',
    'raising resilience finance for communities',
    'improving health outcomes in heatwaves',
    'supporting adaptation targets in NDCs',
    'lowering emissions from critical sectors',
    'safeguarding freshwater ecosystems'
  ];
  const region = regions[Math.floor(Math.random() * regions.length)];
  const lever = levers[Math.floor(Math.random() * levers.length)];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
  return `${lever} in the ${region}: ${outcome}`;
}

function keywords(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, ' ')
    .split(/\\s+/)
    .filter(Boolean);
}

function tooSimilar(title: string, recent: string[]) {
  const current = new Set(keywords(title));
  for (const r of recent) {
    const rWords = new Set(keywords(r));
    let overlap = 0;
    for (const w of current) {
      if (rWords.has(w)) overlap += 1;
    }
    const ratio = overlap / Math.max(1, Math.min(current.size, rWords.size));
    if (ratio > 0.55) return true;
    if (title.toLowerCase().includes(r.toLowerCase().slice(0, 30))) return true;
  }
  return false;
}

function calculateReadability(text: string): number {
  // Simple readability score based on sentence and word length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const avgSentenceLength = words.length / Math.max(1, sentences.length);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / Math.max(1, words.length);
  
  // Score 0-100, higher is more readable (shorter sentences/words = higher score)
  const sentenceScore = Math.max(0, 100 - (avgSentenceLength - 15) * 3);
  const wordScore = Math.max(0, 100 - (avgWordLength - 5) * 10);
  
  return Math.round((sentenceScore + wordScore) / 2);
}

function countSources(text: string): number {
  const sourcePatterns = [
    /\[Source:[^\]]+\]/gi,
    /\(Source:[^\)]+\)/gi,
    /World Bank/gi,
    /UN[\s-]?Data/gi,
    /WHO/gi,
    /FAO/gi,
    /IPCC/gi,
    /IRENA/gi,
    /IEA/gi,
    /Wikipedia/gi,
    /https?:\/\/[^\s]+/gi
  ];
  
  let count = 0;
  for (const pattern of sourcePatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

export async function runAgents(params: AgentRunParams): Promise<AgentRunResult> {
  const { 
    topic, 
    plannerModel, 
    writerModel, 
    factCheckerModel = 'bespoke-minicheck:7b',
    templateId = 'policy-brief',
    researchDepth = 'standard',
    customInstructions = ''
  } = params;

  if (!topic?.trim()) throw new Error('Topic is required.');
  if (!plannerModel?.trim()) throw new Error('Planner model is required.');
  if (!writerModel?.trim()) throw new Error('Writer model is required.');

  // Log pipeline start
  addLogEntry({
    type: 'pipeline-run',
    status: 'running',
    title: `Generating: ${topic.substring(0, 80)}`,
    details: `Models: ${plannerModel} (planner), ${writerModel} (writer), ${factCheckerModel} (fact-checker). Template: ${templateId}. Depth: ${researchDepth}.`,
  }).catch(() => {});

  const log: string[] = [];
  const warnings: string[] = [];
  const template = getTemplate(templateId) || templates['policy-brief'];
  
  log.push(`[${timestamp()}] Starting ${template.name} generation`);
  log.push(`[${timestamp()}] Research depth: ${researchDepth}`);

  // Phase 1: Research
  log.push(`[${timestamp()}] Phase 1: Conducting web research...`);
  let research: ResearchData;
  try {
    research = await conductResearch(topic, researchDepth);
    log.push(`[${timestamp()}] Found ${research.results.length} sources and ${research.statistics.length} statistics`);
  } catch (error) {
    log.push(`[${timestamp()}] Research failed: ${(error as Error).message}`);
    warnings.push('Web research failed - using fallback data sources');
    research = { query: topic, results: [], statistics: [], timestamp: new Date().toISOString() };
  }

  const researchPrompt = formatResearchForPrompt(research);
  
  // Also get legacy public data as backup
  const publicData = await fetchPublicData(topic);
  const recentTitles = await readRecentTitles();
  const recentOutlines = await readRecentOutlines();

  // Phase 2: Planning
  log.push(`[${timestamp()}] Phase 2: Planning with ${plannerModel}...`);
  
  const sectionOutline = template.sections
    .map(s => `- ${s.title}: ${s.description} (~${s.wordCountTarget} words)`)
    .join('\n');

  const plannerMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a policy planner specializing in ${template.audience}.
${template.systemPrompt}

For EACH run, generate a fresh, specific angle and a distinct title.
Vary geography, sector, and evidence focus across runs.
Always include a line formatted exactly as: "Title: <your title>".
Do NOT fabricate numbers - use only the research data provided.
/no_think`
    },
    {
      role: 'user',
      content: `Base theme: ${topic}

Template: ${template.name}
Target audience: ${template.audience}
Tone: ${template.tone}
Total target: ~${template.totalWordTarget} words

Required sections:
${sectionOutline}

${researchPrompt}

Additional data snippets:
${publicData.snippets.map((s) => `- ${s.label}: ${s.value}`).join('\n')}

Recent titles to AVOID: ${recentTitles.join(' | ') || 'none'}
BANNED phrases: ${DEFAULT_BANNED.join(' | ')}
${customInstructions ? `\nCustom instructions: ${customInstructions}` : ''}

Deliver: 
1. Title (specific and engaging)
2. Angle/why-it-matters (2-3 sentences)
3. Detailed outline following the template sections
4. Key data points to cite (from research provided)
5. Any additional evidence needed`
    }
  ];

  let plannerPlan = await callOllamaChat({ 
    model: plannerModel, 
    messages: plannerMessages, 
    temperature: 0.55, 
    topP: 0.9 
  });
  // Strip Qwen3 thinking tags if present
  plannerPlan = plannerPlan.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  log.push('--- Planner output ---');
  log.push(plannerPlan.trim());
  await recordOutline(plannerPlan);

  let proposedTitle = extractPlannerTitle(plannerPlan);
  if (proposedTitle) {
    log.push(`[${timestamp()}] Proposed title: ${proposedTitle}`);
  } else {
    log.push('[${timestamp()}] No explicit title found; will derive/fallback.');
  }

  if (tooSimilar(plannerPlan, recentOutlines)) {
    log.push(`[${timestamp()}] Outline too similar to recent ones; adjusting.`);
    proposedTitle = fallbackTitle(topic);
  }

  if (proposedTitle && tooSimilar(proposedTitle, recentTitles)) {
    log.push(`[${timestamp()}] Title too similar to recent ones; generating fallback.`);
    proposedTitle = fallbackTitle(topic);
  }

  // Phase 3: Writing
  log.push(`[${timestamp()}] Phase 3: Writing with ${writerModel}...`);

  const writerMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${template.systemPrompt}

You are writing a ${template.name} (~${template.totalWordTarget} words) for ${template.audience}.
Tone: ${template.tone}

CRITICAL RULES:
1. Use ONLY the statistics and facts from the research provided
2. Cite sources inline (e.g., "According to World Bank data...")
3. If data is uncertain, mark as [needs verification]
4. Do not invent statistics - if needed, say "data unavailable"
5. Follow the template structure exactly`
    },
    {
      role: 'user',
      content: `Base theme: ${topic}
Use this title (or improve slightly): ${proposedTitle || 'Create a specific, non-generic title'}

Outline:
${plannerPlan}

${researchPrompt}

Write the full ${template.name} following this structure:
${template.sections.map(s => `\n## ${s.title}\n${s.promptHint}`).join('\n')}

Start with an H1 heading using the final title.
Include inline citations for all statistics.`
    }
  ];

  let writerDraft = await callOllamaChat({ 
    model: writerModel, 
    messages: writerMessages, 
    temperature: 0.35, 
    topP: 0.9 
  });
  // Strip Qwen3 thinking tags if present
  writerDraft = writerDraft.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  log.push('--- Writer draft ---');
  log.push(writerDraft.trim().slice(0, 500) + '...');

  // Phase 4: Fact-checking with bespoke-minicheck
  log.push(`[${timestamp()}] Phase 4: Fact-checking with ${factCheckerModel}...`);

  // Extract claims (sentences with numbers/statistics) from the draft
  const draftSentences = writerDraft
    .split(/\n/)
    .filter(line => !line.startsWith('#') && line.trim().length > 20);
  
  const claimsToCheck = draftSentences.filter(s => 
    /\d+/.test(s) || /percent|million|billion|thousand|growth|decline|increase|decrease/i.test(s)
  ).slice(0, 15); // Check up to 15 statistical claims

  const researchDoc = researchPrompt.slice(0, 6000); // Fit within context
  let flaggedClaims: string[] = [];

  if (claimsToCheck.length > 0) {
    log.push(`[${timestamp()}] Checking ${claimsToCheck.length} statistical claims...`);
    
    for (const claim of claimsToCheck) {
      try {
        const checkResult = await callOllamaChat({
          model: factCheckerModel,
          messages: [{ role: 'user', content: `Document: ${researchDoc}\nClaim: ${claim.trim()}` }],
          temperature: 0.0,
          topP: 1.0
        });
        const verdict = checkResult.trim().toLowerCase();
        if (verdict.startsWith('no')) {
          flaggedClaims.push(claim.trim());
        }
      } catch (err) {
        log.push(`[${timestamp()}] Fact-check error for claim: ${(err as Error).message}`);
      }
    }

    log.push(`[${timestamp()}] Fact-check results: ${claimsToCheck.length - flaggedClaims.length} verified, ${flaggedClaims.length} flagged`);
  } else {
    log.push(`[${timestamp()}] No statistical claims found to verify`);
  }

  // Phase 4b: Edit pass — apply fact-check flags and tighten prose
  log.push(`[${timestamp()}] Phase 4b: Editorial pass with ${writerModel}...`);
  
  const flaggedSection = flaggedClaims.length > 0
    ? `\n\nThe following claims could NOT be verified against the research data. Mark each with [VERIFY] or remove them:\n${flaggedClaims.map((c, i) => `${i + 1}. "${c}"`).join('\n')}`
    : '';

  const factMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a fact-checker and editor. Your job is to:
1. Apply the fact-check flags listed below
2. Flag any unsourced claims as [NEEDS SOURCE]
3. Remove or flag fabricated numbers
4. Ensure proper attribution for all data points
5. Maintain formal, neutral tone
6. Keep the structure intact
7. Tighten language for clarity
/no_think

Return the revised document with:
- Verified claims properly cited
- Unverified claims flagged with [VERIFY]
- No fabricated statistics
- Same structure and approximate length`
    },
    {
      role: 'user',
      content: `Draft to edit:\n${writerDraft}\n\nResearch data for reference:\n${researchPrompt}${flaggedSection}\n\nInstructions:\n- Apply [VERIFY] tags to flagged claims\n- Add source citations where missing\n- Remove clearly fabricated statistics\n- Keep the title unless it's generic\n- Preserve the ${template.name} format`
    }
  ];

  let factCheckedDraft = await callOllamaChat({ 
    model: writerModel, 
    messages: factMessages, 
    temperature: 0.2, 
    topP: 0.9 
  });
  // Strip Qwen3 thinking tags if present
  factCheckedDraft = factCheckedDraft.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  log.push('--- Fact-checked draft ---');
  log.push(factCheckedDraft.trim().slice(0, 500) + '...');

  // Phase 4c: Title validation agent
  log.push(`[${timestamp()}] Phase 4c: Validating title with ${plannerModel}...`);
  let articleTitle = proposedTitle || deriveTitle(factCheckedDraft, topic) || '';
  
  if (articleTitle) {
    try {
      const titleCheckMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `You validate titles for policy research articles. Given a title and topic, respond with ONLY one of:\n- "GOOD" if the title is specific, descriptive, and relates to the topic\n- A better title if the original is generic, vague, or a section heading\n\nA good title: names a specific issue, region, or policy lever. 8-20 words.\nA bad title: "Executive Summary", "Policy Brief", "Overview", or anything too generic.\n/no_think`
        },
        {
          role: 'user',
          content: `Topic: ${topic}\nTitle: ${articleTitle}\n\nIs this a good article title? Reply GOOD or provide a better one.`
        }
      ];
      let titleResponse = await callOllamaChat({
        model: plannerModel,
        messages: titleCheckMessages,
        temperature: 0.3,
        topP: 0.9
      });
      titleResponse = titleResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      
      if (!titleResponse.toUpperCase().startsWith('GOOD')) {
        // The model suggested a better title
        const suggestedTitle = titleResponse.replace(/^["']|["']$/g, '').trim();
        if (suggestedTitle.length >= 15 && suggestedTitle.split(/\s+/).length >= 4) {
          log.push(`[${timestamp()}] Title improved: "${articleTitle}" → "${suggestedTitle}"`);
          articleTitle = suggestedTitle;
        }
      } else {
        log.push(`[${timestamp()}] Title validated: "${articleTitle}"`);
      }
    } catch (err) {
      log.push(`[${timestamp()}] Title validation skipped: ${(err as Error).message}`);
    }
  }
  
  if (!articleTitle) articleTitle = fallbackTitle(topic);
  const genericTitles = ['executive summary', 'policy brief', 'introduction', 'overview', 'report'];
  if (genericTitles.some(g => articleTitle.toLowerCase().trim() === g)) {
    log.push(`[${timestamp()}] Title "${articleTitle}" is generic — using fallback`);
    articleTitle = fallbackTitle(topic);
  }

  // Ensure H1 heading uses the proper title, not a section heading
  let contentWithHeading: string;
  const firstLine = factCheckedDraft.trim().split('\n')[0];
  if (firstLine.startsWith('# ')) {
    const existingH1 = firstLine.replace(/^#\s+/, '').trim();
    if (genericTitles.some(g => existingH1.toLowerCase() === g)) {
      // Replace the generic H1 with our proper title
      contentWithHeading = factCheckedDraft.trim().replace(/^#\s+.+/, `# ${articleTitle}`);
    } else {
      contentWithHeading = factCheckedDraft.trim();
      // Update articleTitle to match the H1 if it's better
      if (existingH1.length > articleTitle.length && existingH1.split(/\s+/).length >= 5) {
        articleTitle = existingH1;
      }
    }
  } else {
    contentWithHeading = `# ${articleTitle}\n\n${factCheckedDraft.trim()}`;
  }

  // Calculate quality metrics
  const wordCount = contentWithHeading.split(/\s+/).length;
  const sourcesUsed = countSources(contentWithHeading);
  const sectionsInContent = (contentWithHeading.match(/^##\s+/gm) || []).length;
  const readabilityScore = calculateReadability(contentWithHeading);

  const qualityScore = {
    sourcesUsed,
    wordCount,
    sectionsComplete: Math.min(sectionsInContent, template.sections.length),
    readabilityScore
  };

  log.push(`[${timestamp()}] Quality metrics:`);
  log.push(`  - Word count: ${wordCount} (target: ${template.totalWordTarget})`);
  log.push(`  - Sources cited: ${sourcesUsed}`);
  log.push(`  - Sections: ${sectionsInContent}/${template.sections.length}`);
  log.push(`  - Readability: ${readabilityScore}/100`);

  // Phase 5: QA Gate — validate before publishing
  log.push(`[${timestamp()}] Phase 5: Running QA validation gate...`);
  const requiredSections = template.sections
    .filter(s => s.required)
    .map(s => s.title);

  let qaResult = runQAGate({
    title: articleTitle,
    content: contentWithHeading,
    topic,
    targetWordCount: template.totalWordTarget,
    requiredSections,
  });

  log.push(`[${timestamp()}] QA Score: ${qaResult.score}/100 — ${qaResult.passed ? 'PASSED' : 'FAILED'}`);
  for (const check of qaResult.checks) {
    log.push(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.detail}`);
  }

  // If QA fails, attempt ONE retry with corrective feedback
  if (!qaResult.passed && qaResult.suggestions.length > 0) {
    log.push(`[${timestamp()}] QA failed — attempting corrective retry...`);

    const retryMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `${template.systemPrompt}\n\nYou are rewriting a ${template.name} that failed quality checks. Fix ALL the issues listed below.`
      },
      {
        role: 'user',
        content: `The following article FAILED quality validation. Fix these issues:\n\n${qaResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nOriginal article:\n${contentWithHeading}\n\n${researchPrompt}\n\nREWRITE the full article fixing all issues. Start with "# ${articleTitle}" as the H1 heading. Include ALL required sections: ${requiredSections.join(', ')}. Target: ${template.totalWordTarget} words minimum.`
      }
    ];

    try {
      let retryDraft = await callOllamaChat({
        model: writerModel,
        messages: retryMessages,
        temperature: 0.3,
        topP: 0.9
      });
      // Strip Qwen3 thinking tags if present
      retryDraft = retryDraft.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // Re-evaluate the retry
      const retryContent = retryDraft.trim().startsWith('#')
        ? retryDraft.trim()
        : `# ${articleTitle}\n\n${retryDraft.trim()}`;

      // Fix H1 if still generic
      const retryFirstLine = retryContent.split('\n')[0];
      const retryH1 = retryFirstLine.replace(/^#\s+/, '').trim();
      let finalRetryContent = retryContent;
      if (genericTitles.some(g => retryH1.toLowerCase() === g)) {
        finalRetryContent = retryContent.replace(/^#\s+.+/, `# ${articleTitle}`);
      }

      const retryQA = runQAGate({
        title: articleTitle,
        content: finalRetryContent,
        topic,
        targetWordCount: template.totalWordTarget,
        requiredSections,
      });

      log.push(`[${timestamp()}] Retry QA Score: ${retryQA.score}/100 — ${retryQA.passed ? 'PASSED' : 'STILL FAILED'}`);

      if (retryQA.score > qaResult.score) {
        log.push(`[${timestamp()}] Retry improved quality (${qaResult.score} → ${retryQA.score}), using retry version`);
        contentWithHeading = finalRetryContent;
        qaResult = retryQA;
        // Recalculate metrics for the retry
        const retryWordCount = finalRetryContent.split(/\s+/).length;
        const retrySources = countSources(finalRetryContent);
        const retrySections = (finalRetryContent.match(/^##\s+/gm) || []).length;
        const retryReadability = calculateReadability(finalRetryContent);
        qualityScore.wordCount = retryWordCount;
        qualityScore.sourcesUsed = retrySources;
        qualityScore.sectionsComplete = Math.min(retrySections, template.sections.length);
        qualityScore.readabilityScore = retryReadability;
      }
    } catch (retryErr) {
      log.push(`[${timestamp()}] Retry failed: ${(retryErr as Error).message}`);
    }
  }

  const publishStatus: 'published' | 'draft' = qaResult.passed ? 'published' : 'draft';
  if (!qaResult.passed) {
    warnings.push(`QA validation failed (score: ${qaResult.score}/100). Article saved as DRAFT. Issues: ${qaResult.failReasons.join('; ')}`);
  }

  // Generate HTML report
  const htmlReport = generateHTMLReport({
    content: contentWithHeading,
    metadata: {
      title: articleTitle,
      template: template.name,
      generatedAt: new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      wordCount,
      sourcesUsed,
      readabilityScore
    },
    statistics: research.statistics,
    sources: research.results
  });

  // Save files (both MD and HTML)
  // Deduplicate: if an article with the same slug already exists, replace it
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const slug = slugify(articleTitle);
  
  // Check for existing files with the same slug (different timestamps)
  let baseFileName = `${slug}-${Date.now()}`;
  try {
    const existingFiles = await fs.readdir(OUTPUT_DIR);
    const oldVersions = existingFiles.filter(f => f.startsWith(slug + '-') && f.endsWith('.md'));
    if (oldVersions.length > 0) {
      // Remove old versions to prevent duplicates
      for (const oldFile of oldVersions) {
        const oldMd = path.join(OUTPUT_DIR, oldFile);
        const oldHtml = path.join(OUTPUT_DIR, oldFile.replace('.md', '.html'));
        try { await fs.unlink(oldMd); } catch {}
        try { await fs.unlink(oldHtml); } catch {}
      }
      log.push(`[${timestamp()}] Replaced ${oldVersions.length} older version(s) of this article`);
    }
  } catch {}
  
  const mdFileName = `${baseFileName}.md`;
  const htmlFileName = `${baseFileName}.html`;
  const mdPath = path.join(OUTPUT_DIR, mdFileName);
  const htmlPath = path.join(OUTPUT_DIR, htmlFileName);
  
  await fs.writeFile(mdPath, contentWithHeading, 'utf8');
  await fs.writeFile(htmlPath, htmlReport, 'utf8');
  await recordTitle(articleTitle);
  
  log.push(`[${timestamp()}] Saved: ${mdFileName} and ${htmlFileName}`);

  // Auto-publish to the public library
  try {
    await indexArticle({
      title: articleTitle,
      topic,
      template: template.name,
      content: contentWithHeading,
      mdFile: mdFileName,
      htmlFile: htmlFileName,
      wordCount,
      sourcesUsed,
      readabilityScore,
      autoPublish: publishStatus === 'published',
    });
    log.push(`[${timestamp()}] ${publishStatus === 'published' ? 'Published to public library' : 'Saved as DRAFT (failed QA)'}`);
  } catch (indexErr) {
    log.push(`[${timestamp()}] Warning: failed to index article: ${(indexErr as Error).message}`);
  }

  // Auto-generate social media posts for published articles
  if (publishStatus === 'published') {
    try {
      const slug = mdFileName.replace(/\.md$/, '');
      const socialPosts = await generateSocialPosts(
        { title: articleTitle, topic, template: template.name, slug },
        contentWithHeading,
        plannerModel
      );
      log.push(`[${timestamp()}] Generated ${socialPosts.length} social media posts (queued for review)`);
    } catch (socialErr) {
      log.push(`[${timestamp()}] Warning: social post generation failed: ${(socialErr as Error).message}`);
    }
  }

  // Generate warnings
  if (research.statistics.length === 0 && research.results.length === 0) {
    warnings.push('No research data retrieved. Manual verification strongly recommended.');
  }
  if (sourcesUsed < 3) {
    warnings.push('Few sources cited. Consider adding more evidence before publication.');
  }
  if (contentWithHeading.includes('[VERIFY]') || contentWithHeading.includes('[needs verification]')) {
    warnings.push('Some claims flagged for verification. Review before publishing.');
  }
  if (wordCount < template.totalWordTarget * 0.7) {
    warnings.push(`Word count (${wordCount}) below target (${template.totalWordTarget}). Consider expanding.`);
  }

  // Log pipeline completion
  addLogEntry({
    type: 'pipeline-run',
    status: publishStatus === 'published' ? 'success' : 'warning',
    title: articleTitle,
    details: `${publishStatus === 'published' ? 'Published' : 'Saved as draft'}. ${wordCount} words, quality score: ${qualityScore}. ${sourcesUsed} sources.`,
    meta: { wordCount, qualityScore, sourcesUsed, publishStatus, warnings: warnings.length },
  }).catch(() => {});

  return {
    articlePath: path.relative(process.cwd(), mdPath),
    articlePathHTML: path.relative(process.cwd(), htmlPath),
    articleTitle,
    articleContent: contentWithHeading,
    articleContentHTML: htmlReport,
    log: log.join('\n\n'),
    warnings,
    research,
    qualityScore,
    qaResult,
    status: publishStatus,
  };
}
