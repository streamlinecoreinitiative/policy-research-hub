#!/usr/bin/env python3
"""
Remove near-duplicate articles that share the same base topic.
The slug is truncated at 80 chars, so "watershed co-management...lowering emissions"
and "watershed co-management...cutting disaster losses" get different slugs but
cover the same topic. This script groups by the base slug (minus the last word
fragment before the timestamp) and keeps only the newest+largest file per group.
"""

import os
import re
import sys
from collections import defaultdict

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'output')

def parse_filename(filename):
    """Extract base slug, sub-slug, and timestamp."""
    match = re.match(r'^(.+)-(\d{10,15})\.(md|html)$', filename)
    if not match:
        return None, None, None, None
    full_slug = match.group(1)
    ts = int(match.group(2))
    ext = match.group(3)
    
    # The base topic is the slug truncated by the 80-char slugify.
    # Near-duplicates differ only in the last few chars (subtitle fragment).
    # Strategy: remove the last hyphen-segment to get the base topic.
    parts = full_slug.rsplit('-', 1)
    if len(parts) == 2 and len(parts[1]) <= 5:
        # Last segment is a short fragment (truncated subtitle word)
        base = parts[0]
    else:
        base = full_slug
    
    return base, full_slug, ts, ext

def main():
    dry_run = '--dry-run' in sys.argv
    
    # Group .md files by base slug
    groups = defaultdict(list)
    for f in sorted(os.listdir(OUTPUT_DIR)):
        if not f.endswith('.md'):
            continue
        base, full_slug, ts, ext = parse_filename(f)
        if base is None:
            continue
        size = os.path.getsize(os.path.join(OUTPUT_DIR, f))
        groups[base].append((ts, size, f, full_slug))
    
    total_deleted = 0
    total_kept = 0
    
    for base, versions in sorted(groups.items()):
        if len(versions) <= 1:
            total_kept += 1
            continue
        
        # Keep largest file (best quality/most content), break ties by newest
        versions.sort(key=lambda x: (x[1], x[0]), reverse=True)
        keeper = versions[0]
        dupes = versions[1:]
        
        total_kept += 1
        
        if dupes:
            print(f"\n  {base} ({len(versions)} versions):")
            print(f"    KEEP: {keeper[2]} ({keeper[1]}b, ts={keeper[0]})")
        
        for ts, size, fname, slug in dupes:
            md_path = os.path.join(OUTPUT_DIR, fname)
            html_fname = fname.replace('.md', '.html')
            html_path = os.path.join(OUTPUT_DIR, html_fname)
            
            if dry_run:
                print(f"    WOULD DELETE: {fname} ({size}b)")
            else:
                if os.path.exists(md_path):
                    os.remove(md_path)
                if os.path.exists(html_path):
                    os.remove(html_path)
                print(f"    DELETED: {fname}")
                total_deleted += 1
    
    remaining = len([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.md')])
    print(f"\n{'DRY RUN — ' if dry_run else ''}Summary:")
    print(f"  Groups: {len(groups)}")
    print(f"  Kept: {total_kept}")
    print(f"  Deleted: {total_deleted} duplicate articles (md+html pairs)")
    print(f"  Remaining .md files: {remaining}")

if __name__ == '__main__':
    main()
