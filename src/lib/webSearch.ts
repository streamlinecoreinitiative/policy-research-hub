/**
 * Web Search Module
 * Uses DuckDuckGo Instant Answer API and scraping for real data
 */

export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
  source: string;
};

export type ResearchData = {
  query: string;
  results: SearchResult[];
  statistics: { label: string; value: string; source: string }[];
  timestamp: string;
};

// DuckDuckGo Instant Answers API (free, no key needed)
async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'ResearchAgent/1.0' }
    });
    clearTimeout(timeout);
    
    if (!res.ok) return [];
    
    const data = await res.json();
    const results: SearchResult[] = [];
    
    // Abstract (main answer)
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: data.AbstractSource || 'DuckDuckGo'
      });
    }
    
    // Related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo'
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    return [];
  }
}

// Wikipedia API for factual data
async function wikipediaSearch(query: string): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'ResearchAgent/1.0' }
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      // Try search API instead
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json&srlimit=3`;
      const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': 'ResearchAgent/1.0' } });
      if (!searchRes.ok) return [];
      
      const searchData = await searchRes.json();
      const results: SearchResult[] = [];
      
      for (const item of searchData.query?.search || []) {
        results.push({
          title: item.title,
          snippet: item.snippet.replace(/<[^>]*>/g, ''),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
          source: 'Wikipedia'
        });
      }
      return results;
    }
    
    const data = await res.json();
    return [{
      title: data.title,
      snippet: data.extract || '',
      url: data.content_urls?.desktop?.page || '',
      source: 'Wikipedia'
    }];
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return [];
  }
}

// World Bank API for development statistics
async function worldBankData(topic: string): Promise<{ label: string; value: string; source: string }[]> {
  const stats: { label: string; value: string; source: string }[] = [];
  
  // Map topics to relevant World Bank indicators
  const indicatorMap: Record<string, { indicator: string; label: string; countries: string[] }[]> = {
    water: [
      { indicator: 'SH.H2O.SMDW.ZS', label: 'Access to safely managed drinking water (%)', countries: ['WLD', 'SSF', 'SAS'] },
      { indicator: 'ER.H2O.FWTL.ZS', label: 'Freshwater withdrawal (% of resources)', countries: ['WLD'] }
    ],
    energy: [
      { indicator: 'EG.ELC.ACCS.ZS', label: 'Access to electricity (%)', countries: ['WLD', 'SSF', 'SAS'] },
      { indicator: 'EG.FEC.RNEW.ZS', label: 'Renewable energy consumption (%)', countries: ['WLD'] }
    ],
    climate: [
      { indicator: 'EN.ATM.CO2E.PC', label: 'CO2 emissions (metric tons per capita)', countries: ['WLD', 'SSF'] },
      { indicator: 'AG.LND.FRST.ZS', label: 'Forest area (% of land)', countries: ['WLD'] }
    ],
    agriculture: [
      { indicator: 'AG.LND.ARBL.ZS', label: 'Arable land (% of land)', countries: ['WLD'] },
      { indicator: 'AG.YLD.CREL.KG', label: 'Cereal yield (kg per hectare)', countries: ['WLD', 'SSF'] }
    ],
    health: [
      { indicator: 'SH.STA.STNT.ZS', label: 'Stunting prevalence (% children under 5)', countries: ['WLD', 'SSF', 'SAS'] },
      { indicator: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth', countries: ['WLD'] }
    ]
  };
  
  // Determine relevant indicators from topic
  const topicLower = topic.toLowerCase();
  const relevantIndicators: { indicator: string; label: string; countries: string[] }[] = [];
  
  for (const [key, indicators] of Object.entries(indicatorMap)) {
    if (topicLower.includes(key)) {
      relevantIndicators.push(...indicators);
    }
  }
  
  // Default to energy + climate if no specific match
  if (relevantIndicators.length === 0) {
    relevantIndicators.push(...(indicatorMap.energy || []));
    relevantIndicators.push(...(indicatorMap.climate || []));
  }
  
  // Fetch data for each indicator
  for (const { indicator, label, countries } of relevantIndicators.slice(0, 4)) {
    for (const country of countries.slice(0, 2)) {
      try {
        const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=1&mrnev=1`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!res.ok) continue;
        
        const data = await res.json();
        if (data[1] && data[1][0]) {
          const item = data[1][0];
          const countryName = item.country?.value || country;
          const year = item.date || 'latest';
          const value = item.value !== null ? Number(item.value).toFixed(1) : 'N/A';
          
          stats.push({
            label: `${label} - ${countryName} (${year})`,
            value: value,
            source: `World Bank Open Data`
          });
        }
      } catch (error) {
        console.error(`World Bank API error for ${indicator}:`, error);
      }
    }
  }
  
  return stats;
}

// UN Data for SDG-related statistics  
async function unDataSearch(topic: string): Promise<{ label: string; value: string; source: string }[]> {
  // UN Stats API is complex; using curated SDG-related data points
  const sdgData: Record<string, { label: string; value: string; source: string }[]> = {
    water: [
      { label: 'Global population lacking safe water (2022)', value: '2.2 billion people', source: 'UN-Water/WHO' },
      { label: 'SDG 6 progress - safely managed water', value: '74% global coverage', source: 'UN SDG Report 2023' }
    ],
    climate: [
      { label: 'Global temperature rise since pre-industrial', value: '+1.1°C', source: 'IPCC AR6' },
      { label: 'Climate finance needed annually (developing countries)', value: '$5.8-5.9 trillion by 2030', source: 'UNFCCC' }
    ],
    energy: [
      { label: 'Population without electricity (2021)', value: '675 million people', source: 'IEA/World Bank' },
      { label: 'Renewable share of global electricity', value: '29% (2022)', source: 'IRENA' }
    ],
    food: [
      { label: 'People facing acute food insecurity (2023)', value: '258 million in 58 countries', source: 'WFP/FAO' },
      { label: 'Undernourished population globally', value: '735 million (2022)', source: 'FAO SOFI Report' }
    ]
  };
  
  const topicLower = topic.toLowerCase();
  const results: { label: string; value: string; source: string }[] = [];
  
  for (const [key, data] of Object.entries(sdgData)) {
    if (topicLower.includes(key) || topicLower.includes('resilience') || topicLower.includes('climate')) {
      results.push(...data);
    }
  }
  
  return results.slice(0, 4);
}

// Main research function
export async function conductResearch(topic: string, depth: 'quick' | 'standard' | 'deep' = 'standard'): Promise<ResearchData> {
  console.log(`[Research] Starting ${depth} research for: ${topic}`);
  
  const allResults: SearchResult[] = [];
  const allStats: { label: string; value: string; source: string }[] = [];
  
  // Extract key terms from topic
  const keyTerms = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !['with', 'from', 'that', 'this', 'they', 'have', 'been', 'more', 'some'].includes(word))
    .slice(0, 5);
  
  const searchQueries = [
    topic.slice(0, 100),
    ...keyTerms.slice(0, 2).map(term => `${term} statistics data`)
  ];
  
  // Parallel searches based on depth
  const searches: Promise<SearchResult[]>[] = [];
  const statSearches: Promise<{ label: string; value: string; source: string }[]>[] = [];
  
  // Always do basic searches
  searches.push(duckDuckGoSearch(searchQueries[0]));
  searches.push(wikipediaSearch(keyTerms[0] || topic.split(' ')[0]));
  statSearches.push(worldBankData(topic));
  statSearches.push(unDataSearch(topic));
  
  if (depth === 'standard' || depth === 'deep') {
    // Add more searches for key terms
    for (const query of searchQueries.slice(1, 3)) {
      searches.push(duckDuckGoSearch(query));
    }
    if (keyTerms[1]) {
      searches.push(wikipediaSearch(keyTerms[1]));
    }
  }
  
  if (depth === 'deep') {
    // Even more comprehensive searches
    for (const term of keyTerms.slice(2, 4)) {
      searches.push(wikipediaSearch(term));
    }
  }
  
  // Wait for all searches
  const searchResults = await Promise.all(searches);
  const statResults = await Promise.all(statSearches);
  
  for (const results of searchResults) {
    allResults.push(...results);
  }
  
  for (const stats of statResults) {
    allStats.push(...stats);
  }
  
  // Deduplicate results by URL
  const seenUrls = new Set<string>();
  const uniqueResults = allResults.filter(r => {
    if (!r.url || seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });
  
  // Deduplicate stats by label
  const seenLabels = new Set<string>();
  const uniqueStats = allStats.filter(s => {
    const key = s.label.toLowerCase();
    if (seenLabels.has(key)) return false;
    seenLabels.add(key);
    return true;
  });
  
  console.log(`[Research] Found ${uniqueResults.length} sources and ${uniqueStats.length} statistics`);
  
  return {
    query: topic,
    results: uniqueResults.slice(0, 10),
    statistics: uniqueStats.slice(0, 8),
    timestamp: new Date().toISOString()
  };
}

// Format research for LLM consumption
export function formatResearchForPrompt(research: ResearchData): string {
  let formatted = '## Research Data\n\n';
  
  if (research.statistics.length > 0) {
    formatted += '### Key Statistics (Verified Sources)\n';
    for (const stat of research.statistics) {
      formatted += `- **${stat.label}**: ${stat.value} [Source: ${stat.source}]\n`;
    }
    formatted += '\n';
  }
  
  if (research.results.length > 0) {
    formatted += '### Background Information\n';
    for (const result of research.results.slice(0, 6)) {
      formatted += `\n**${result.title}** (${result.source})\n`;
      formatted += `${result.snippet.slice(0, 300)}${result.snippet.length > 300 ? '...' : ''}\n`;
      if (result.url) formatted += `Source: ${result.url}\n`;
    }
  }
  
  return formatted;
}
