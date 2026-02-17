import { setTimeout as delay } from 'timers/promises';

type FetcherResult = { label: string; value: string };

async function safeFetch(url: string, label: string): Promise<FetcherResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return { label, value: JSON.stringify(data).slice(0, 600) };
  } catch {
    return null;
  }
}

export async function fetchPublicData(topic: string) {
  const results: FetcherResult[] = [];

  // World Bank electricity access (SSA) as a generic energy/water anchor
  const wb = await safeFetch(
    'https://api.worldbank.org/v2/country/SSF/indicator/EG.ELC.ACCS.ZS?format=json&per_page=1',
    'World Bank: electricity access (% of population, Sub-Saharan Africa, latest)'
  );
  if (wb) results.push(wb);

  // World Bank renewable energy consumption (world)
  const wbRenew = await safeFetch(
    'https://api.worldbank.org/v2/country/WLD/indicator/EG.FEC.RNEW.ZS?format=json&per_page=1',
    'World Bank: renewable energy consumption (% of TFEC, world, latest)'
  );
  if (wbRenew) results.push(wbRenew);

  // NOAA climate data placeholder (mock via text; real call would require location/params)
  const noaaNote = {
    label: 'NOAA climate (placeholder)',
    value: 'Add NOAA dataset query with location + element (e.g., PRCP/TMAX) when network allowed.'
  };
  results.push(noaaNote);

  // If everything failed, return a stub
  if (results.length === 0) {
    results.push({
      label: 'Notice',
      value: 'No public data fetched (network blocked or API unavailable). Proceed with manual verification.'
    });
  }

  // Small jitter to avoid hammering in quick loops
  await delay(50);
  return { topic, snippets: results };
}
