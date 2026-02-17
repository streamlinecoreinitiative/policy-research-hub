/**
 * Bootstrap Script
 * Run once to index all existing articles into the public library.
 * Usage: npx tsx scripts/bootstrap-index.ts
 */

import { bootstrapIndex, readIndex } from '../src/lib/articleIndex';

async function main() {
  console.log('Bootstrapping article index from existing output files...');
  
  const before = await readIndex();
  console.log(`Current index has ${before.articles.length} articles.`);
  
  const newCount = await bootstrapIndex();
  
  const after = await readIndex();
  console.log(`\nBootstrap complete!`);
  console.log(`  New articles indexed: ${newCount}`);
  console.log(`  Total in index: ${after.articles.length}`);
  console.log(`  Published: ${after.totalPublished}`);
  
  if (after.articles.length > 0) {
    console.log(`\nLatest 5 articles:`);
    for (const a of after.articles.slice(0, 5)) {
      console.log(`  - ${a.title} (${a.tags.join(', ')})`);
    }
  }
}

main().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
