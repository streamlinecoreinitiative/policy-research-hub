import fs from 'fs/promises';
import path from 'path';
import { callOllamaChat, ChatMessage } from './ollama';
import { fetchPublicData } from './dataSources';

const OUTPUT_DIR = path.join(process.cwd(), 'data/output');
const RECENT_TITLES_PATH = path.join(process.cwd(), 'data/recent_titles.json');
const RECENT_OUTLINES_PATH = path.join(process.cwd(), 'data/recent_outlines.json');
const DEFAULT_BANNED = ['solar-powered wells', 'rainwater harvesting ponds'];

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
  if (heading) return heading.replace(/^#+\s*/, '').trim();
  return `Brief: ${topic.slice(0, 120)}`;
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

export async function runAgents(params: { topic: string; plannerModel: string; writerModel: string }) {
  const { topic, plannerModel, writerModel } = params;

  if (!topic?.trim()) throw new Error('Topic is required.');
  if (!plannerModel?.trim()) throw new Error('Planner model is required.');
  if (!writerModel?.trim()) throw new Error('Writer model is required.');

  const log: string[] = [];
  const recentTitles = await readRecentTitles();
  const recentOutlines = await readRecentOutlines();
  const publicData = await fetchPublicData(topic);

  const plannerMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a policy planner for environmental topics in lower-income countries. For EACH run, generate a fresh, specific angle and a distinct title (avoid generic or repeated headlines). Vary geography, sector, and evidence focus across runs. Avoid titles similar to recent ones provided. Always include a line formatted exactly as: \"Title: <your title>\". Avoid repeating the same intervention pairings (e.g., solar-powered wells) and pick different lead interventions. Produce: 1) Title, 2) Angle/why-it-matters, 3) Outline with 4-6 sections, 4) Key data points needed, 5) Official sources (UN, World Bank, OECD, local ministries), 6) Data gaps. Do NOT fabricate numbers.'
    },
    {
      role: 'user',
      content: `Base theme: ${topic}
Recent titles to avoid: ${recentTitles.join(' | ') || 'none'}
BANNED phrases/interventions: ${DEFAULT_BANNED.join(' | ')}
Recent outline themes to avoid: ${recentOutlines.slice(0, 5).join(' | ') || 'none'}
Data snippets you can cite (verify as needed):
${publicData.snippets.map((s) => `- ${s.label}: ${s.value}`).join('\n')}
Deliver: Title + angle + bullet outline with rationale and needed evidence.`
    }
  ];

  log.push(`[${timestamp()}] Planner model: ${plannerModel}`);
  const plannerPlan = await callOllamaChat({ model: plannerModel, messages: plannerMessages, temperature: 0.55, topP: 0.9 });
  log.push('--- Planner plan ---');
  log.push(plannerPlan.trim());
  await recordOutline(plannerPlan);

  let proposedTitle = extractPlannerTitle(plannerPlan);
  if (proposedTitle) {
    log.push(`Proposed title from planner: ${proposedTitle}`);
  } else {
    log.push('No explicit title found in planner output; will derive/fallback.');
  }

  if (tooSimilar(plannerPlan, recentOutlines)) {
    log.push('Planner outline seems similar to recent ones; adjusting with fallback title.');
    proposedTitle = fallbackTitle(topic);
  }

  if (proposedTitle && tooSimilar(proposedTitle, recentTitles)) {
    log.push('Proposed title is too similar to recent ones; generating fallback.');
    proposedTitle = fallbackTitle(topic);
  }

  const writerMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a senior policy writer. Draft a formal, neutral brief (800-1200 words) for international audiences. Use clear headings, bullets where helpful, and short paragraphs. Base arguments on the provided outline; do not invent citations or statistics. If data is missing, explicitly mark it as needing verification.'
    },
    {
      role: 'user',
      content: `Base theme: ${topic}
Use this distinct title (or improve it slightly while staying specific): ${proposedTitle || 'Create a specific, non-generic title'}.
Outline:
${plannerPlan}

Write the full brief with an executive summary, 3-4 main sections, a short actions/recommendations list, and a closing outlook.
Start the response with an H1 heading using the final title.`
    }
  ];

  log.push(`[${timestamp()}] Writer model: ${writerModel}`);
  const writerDraft = await callOllamaChat({ model: writerModel, messages: writerMessages, temperature: 0.4, topP: 0.9 });
  log.push('--- Writer draft ---');
  log.push(writerDraft.trim());

  const factMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a fact-checker and editor. Return a revised brief that corrects or flags unverified claims, removes fabricated numbers, and keeps a formal, neutral tone. Keep headings and structure, but tighten language. Start with the existing H1 title from the draft.'
    },
    {
      role: 'user',
      content: `Draft to fact-check and refine:\n${writerDraft}\n\nGuidance:\n- Flag any numbers lacking sources as "[verify]".\n- Remove speculative claims that are not evidence-backed.\n- Keep length similar.\n- Preserve the title unless it is generic; if generic, replace with a specific one consistent with the outline.`
    }
  ];

  const factCheckedDraft = await callOllamaChat({ model: writerModel, messages: factMessages, temperature: 0.2, topP: 0.9 });
  log.push('--- Fact-check + edit ---');
  log.push(factCheckedDraft.trim());

  const articleTitle = proposedTitle || deriveTitle(factCheckedDraft, topic) || fallbackTitle(topic);
  const contentWithHeading = factCheckedDraft.trim().startsWith('#')
    ? factCheckedDraft.trim()
    : `# ${articleTitle}\n\n${factCheckedDraft.trim()}`;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const fileName = `${slugify(articleTitle)}-${Date.now()}.md`;
  const fullPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(fullPath, contentWithHeading, 'utf8');
  await recordTitle(articleTitle);

  const warnings = ['No live web search performed. Verify any facts or figures before publication.'];

  return {
    articlePath: path.relative(process.cwd(), fullPath),
    articleTitle,
    articleContent: contentWithHeading,
    log: log.join('\n\n'),
    warnings
  };
}
