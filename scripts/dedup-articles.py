#!/usr/bin/env python3
"""
Deduplicate articles in data/output/.
For each slug (filename minus timestamp), keeps the NEWEST version
(highest timestamp = most recent) and deletes all older duplicates.
Also picks the LARGEST file when timestamps are equal, as a quality signal.
"""

import os
import re
import sys
from collections import defaultdict

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'output')

def get_slug_and_ts(filename):
    """Extract slug and timestamp from filename like 'slug-name-1234567890123.md'"""
    match = re.match(r'^(.+)-(\d{10,15})\.(md|html)$', filename)
    if match:
        return match.group(1), int(match.group(2)), match.group(3)
    return None, None, None

def main():
    dry_run = '--dry-run' in sys.argv
    
    # Group .md files by slug
    groups = defaultdict(list)
    for f in os.listdir(OUTPUT_DIR):
        if not f.endswith('.md'):
            continue
        slug, ts, ext = get_slug_and_ts(f)
        if slug and ts:
            fpath = os.path.join(OUTPUT_DIR, f)
            size = os.path.getsize(fpath)
            groups[slug].append((ts, size, f))
    
    total_deleted = 0
    total_kept = 0
    
    for slug, versions in sorted(groups.items()):
        if len(versions) <= 1:
            total_kept += 1
            continue
        
        # Sort by timestamp desc, then by size desc (newest & largest first)
        versions.sort(key=lambda x: (x[0], x[1]), reverse=True)
        keeper = versions[0]
        dupes = versions[1:]
        
        total_kept += 1
        
        for ts, size, fname in dupes:
            md_path = os.path.join(OUTPUT_DIR, fname)
            html_fname = fname.replace('.md', '.html')
            html_path = os.path.join(OUTPUT_DIR, html_fname)
            
            if dry_run:
                print(f"  WOULD DELETE: {fname} (ts={ts}, {size}b)")
            else:
                if os.path.exists(md_path):
                    os.remove(md_path)
                if os.path.exists(html_path):
                    os.remove(html_path)
                total_deleted += 1
        
        if len(dupes) > 0 and not dry_run:
            print(f"  {slug}: kept {keeper[2]}, removed {len(dupes)} older version(s)")
    
    print(f"\n{'DRY RUN — ' if dry_run else ''}Summary:")
    print(f"  Unique topics: {len(groups)}")
    print(f"  Kept: {total_kept}")
    print(f"  Deleted: {total_deleted} duplicate article(s) (md+html pairs)")
    
    remaining = len([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.md')])
    print(f"  Remaining .md files: {remaining}")

if __name__ == '__main__':
    main()
