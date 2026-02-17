/**
 * Article Index System
 * Tracks all generated articles with metadata for the public library.
 * Stores index in data/articles-index.json
 */

import fs from 'fs/promises';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'data/articles-index.json');
const OUTPUT_DIR = path.join(process.cwd(), 'data/output');

export type ArticleMeta = {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  template: string;
  tags: string[];
  wordCount: number;
  sourcesUsed: number;
  readabilityScore: number;
  publishedAt: string;
  updatedAt: string;
  status: 'draft' | 'published';
  mdFile: string;
  htmlFile: string;
  region?: string;
  ogImage?: string;
};

export type ArticlesIndex = {
  articles: ArticleMeta[];
  lastUpdated: string;
  totalPublished: number;
};

// Extract a ~2-sentence summary from article content
function extractSummary(content: string): string {
  // Remove markdown headings and get the first substantive paragraph
  const lines = content.split('\n').filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('---');
  });
  
  // Join and take ~ first 300 chars, ending at a sentence boundary
  const text = lines.join(' ').replace(/\*\*/g, '').replace(/\*/g, '').trim();
  const cutoff = text.indexOf('.', 150);
  if (cutoff > 0 && cutoff < 400) {
    return text.slice(0, cutoff + 1).trim();
  }
  return text.slice(0, 300).trim() + '...';
}

// Extract tags from topic and content
function extractTags(topic: string, content: string): string[] {
  const tagKeywords: Record<string, string[]> = {
    'climate': ['climate', 'warming', 'temperature', 'carbon', 'emissions'],
    'water': ['water', 'irrigation', 'hydro', 'watershed', 'drought', 'flood'],
    'energy': ['energy', 'solar', 'wind', 'renewable', 'microgrid', 'electricity'],
    'agriculture': ['agriculture', 'farming', 'crop', 'agroforestry', 'food security'],
    'health': ['health', 'disease', 'sanitation', 'nutrition', 'medical'],
    'policy': ['policy', 'governance', 'regulation', 'legislation', 'reform'],
    'finance': ['finance', 'funding', 'investment', 'economic', 'microfinance'],
    'resilience': ['resilience', 'adaptation', 'disaster', 'risk', 'vulnerability'],
    'biodiversity': ['biodiversity', 'ecosystem', 'conservation', 'species', 'habitat'],
    'urbanization': ['urban', 'city', 'infrastructure', 'housing', 'transport'],
    'education': ['education', 'school', 'training', 'literacy', 'capacity'],
    'gender': ['gender', 'women', 'girls', 'maternal', 'equality'],
  };

  const combined = `${topic} ${content}`.toLowerCase();
  const tags: string[] = [];

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(kw => combined.includes(kw))) {
      tags.push(tag);
    }
  }

  // Extract region if mentioned
  const regions: Record<string, string[]> = {
    'sub-saharan-africa': ['sub-saharan', 'sahel', 'east africa', 'west africa', 'horn of africa'],
    'south-asia': ['south asia', 'india', 'bangladesh', 'nepal', 'sri lanka'],
    'southeast-asia': ['southeast asia', 'mekong', 'vietnam', 'cambodia', 'myanmar'],
    'latin-america': ['latin america', 'central america', 'caribbean', 'andean'],
    'pacific-islands': ['pacific', 'sids', 'pacific islands', 'fiji'],
    'middle-east': ['middle east', 'mena', 'north africa'],
  };

  for (const [region, keywords] of Object.entries(regions)) {
    if (keywords.some(kw => combined.includes(kw))) {
      tags.push(region);
    }
  }

  return Array.from(new Set(tags)).slice(0, 8);
}

// Detect region from content
function detectRegion(topic: string, content: string): string | undefined {
  const combined = `${topic} ${content}`.toLowerCase();
  const regionMap: Record<string, string[]> = {
    'Sub-Saharan Africa': ['sub-saharan', 'sahel', 'east africa', 'west africa', 'horn of africa', 'nigeria', 'kenya', 'ethiopia', 'tanzania'],
    'South Asia': ['south asia', 'india', 'bangladesh', 'nepal', 'sri lanka', 'pakistan'],
    'Southeast Asia': ['southeast asia', 'mekong', 'vietnam', 'cambodia', 'myanmar', 'philippines', 'indonesia'],
    'Latin America & Caribbean': ['latin america', 'central america', 'caribbean', 'andean', 'brazil', 'colombia', 'peru'],
    'Pacific Islands': ['pacific islands', 'pacific sids', 'fiji', 'tonga', 'vanuatu'],
    'Middle East & North Africa': ['middle east', 'mena', 'north africa', 'egypt', 'jordan'],
    'Central Asia': ['central asia', 'afghanistan', 'tajikistan', 'kyrgyzstan'],
    'Global': [],
  };

  for (const [region, keywords] of Object.entries(regionMap)) {
    if (keywords.some(kw => combined.includes(kw))) {
      return region;
    }
  }
  return 'Global';
}

export async function readIndex(): Promise<ArticlesIndex> {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { articles: [], lastUpdated: new Date().toISOString(), totalPublished: 0 };
  }
}

export async function writeIndex(index: ArticlesIndex): Promise<void> {
  index.lastUpdated = new Date().toISOString();
  index.totalPublished = index.articles.filter(a => a.status === 'published').length;
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

export async function indexArticle(params: {
  title: string;
  topic: string;
  template: string;
  content: string;
  mdFile: string;
  htmlFile: string;
  wordCount: number;
  sourcesUsed: number;
  readabilityScore: number;
  autoPublish?: boolean;
}): Promise<ArticleMeta> {
  const { title, topic, template, content, mdFile, htmlFile, wordCount, sourcesUsed, readabilityScore, autoPublish = true } = params;

  const slug = mdFile.replace('.md', '').replace(/\s+/g, '-');
  const now = new Date().toISOString();

  const article: ArticleMeta = {
    slug,
    title,
    summary: extractSummary(content),
    topic,
    template,
    tags: extractTags(topic, content),
    wordCount,
    sourcesUsed,
    readabilityScore,
    publishedAt: now,
    updatedAt: now,
    status: autoPublish ? 'published' : 'draft',
    mdFile,
    htmlFile,
    region: detectRegion(topic, content),
  };

  const index = await readIndex();
  
  // Remove existing entry with same slug if re-generating
  index.articles = index.articles.filter(a => a.slug !== slug);
  
  // Add new article at the beginning
  index.articles.unshift(article);
  
  await writeIndex(index);
  
  return article;
}

export async function getPublishedArticles(options?: {
  tag?: string;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ articles: ArticleMeta[]; total: number }> {
  const index = await readIndex();
  let articles = index.articles.filter(a => a.status === 'published');

  if (options?.tag) {
    articles = articles.filter(a => a.tags.includes(options.tag!));
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.tags.some(t => t.includes(q)) ||
      (a.region?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = articles.length;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 20;

  return {
    articles: articles.slice(offset, offset + limit),
    total,
  };
}

export async function getArticleBySlug(slug: string): Promise<{
  meta: ArticleMeta;
  content: string;
  htmlContent: string;
} | null> {
  const index = await readIndex();
  const meta = index.articles.find(a => a.slug === slug);
  if (!meta) return null;

  try {
    const mdPath = path.join(OUTPUT_DIR, meta.mdFile);
    const htmlPath = path.join(OUTPUT_DIR, meta.htmlFile);
    const content = await fs.readFile(mdPath, 'utf8');
    let htmlContent = '';
    try {
      htmlContent = await fs.readFile(htmlPath, 'utf8');
    } catch {
      // HTML file may not exist for older articles
    }
    return { meta, content, htmlContent };
  } catch {
    return null;
  }
}

export async function updateArticleStatus(slug: string, status: 'draft' | 'published'): Promise<boolean> {
  const index = await readIndex();
  const article = index.articles.find(a => a.slug === slug);
  if (!article) return false;
  article.status = status;
  article.updatedAt = new Date().toISOString();
  await writeIndex(index);
  return true;
}

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const index = await readIndex();
  const published = index.articles.filter(a => a.status === 'published');
  const tagMap = new Map<string, number>();
  
  for (const article of published) {
    for (const tag of article.tags) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// Bootstrap: scan existing output files and index any un-indexed ones
export async function bootstrapIndex(): Promise<number> {
  const index = await readIndex();
  const existingSlugs = new Set(index.articles.map(a => a.slug));
  
  let newCount = 0;
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    for (const mdFile of mdFiles) {
      const slug = mdFile.replace('.md', '');
      if (existingSlugs.has(slug)) continue;
      
      const htmlFile = mdFile.replace('.md', '.html');
      const mdPath = path.join(OUTPUT_DIR, mdFile);
      
      try {
        const content = await fs.readFile(mdPath, 'utf8');
        const title = content.split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '').trim() || slug;
        const wordCount = content.split(/\s+/).length;
        
        await indexArticle({
          title,
          topic: title,
          template: 'policy-brief',
          content,
          mdFile,
          htmlFile,
          wordCount,
          sourcesUsed: 0,
          readabilityScore: 70,
          autoPublish: true,
        });
        newCount++;
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Output directory doesn't exist yet
  }
  
  return newCount;
}
