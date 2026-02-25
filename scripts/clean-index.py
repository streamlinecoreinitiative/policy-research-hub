#!/usr/bin/env python3
"""
Clean duplicate articles by TITLE (not just slug).
Keeps the newest version of each unique title and deletes the rest.
Also removes index entries pointing to non-existent files.
"""

import json
import os
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE_DIR, '..')
INDEX_PATH = os.path.join(ROOT, 'data', 'articles-index.json')
OUTPUT_DIR = os.path.join(ROOT, 'data', 'output')


def main():
    with open(INDEX_PATH, 'r') as f:
        data = json.load(f)

    articles = data['articles']
    print(f"Starting index entries: {len(articles)}")

    # Step 1: Remove entries where the file doesn't exist
    valid = []
    orphans = 0
    for a in articles:
        md_path = os.path.join(OUTPUT_DIR, a['mdFile'])
        if os.path.exists(md_path):
            valid.append(a)
        else:
            orphans += 1
            print(f"  Orphan removed: {a['slug']}")
    print(f"Orphan entries removed: {orphans}")

    # Step 2: Group by normalized title, keep newest per group
    groups = defaultdict(list)
    for a in valid:
        key = a['title'].lower().strip()
        groups[key].append(a)

    keep = []
    deleted_files = 0
    for title, versions in groups.items():
        # Sort: newest first (by publishedAt), then largest wordCount
        versions.sort(
            key=lambda x: (x.get('publishedAt', ''), x.get('wordCount', 0)),
            reverse=True
        )
        keep.append(versions[0])

        for dupe in versions[1:]:
            md_path = os.path.join(OUTPUT_DIR, dupe['mdFile'])
            html_path = os.path.join(OUTPUT_DIR, dupe['htmlFile'])
            if os.path.exists(md_path):
                os.remove(md_path)
            if os.path.exists(html_path):
                os.remove(html_path)
            deleted_files += 1
            print(f"  Dupe deleted: {dupe['mdFile']}")

    # Step 3: Check for .md files on disk not in the index (shouldn't happen but just in case)
    indexed_files = set(a['mdFile'] for a in keep)
    disk_files = set(f for f in os.listdir(OUTPUT_DIR) if f.endswith('.md'))
    unindexed = disk_files - indexed_files
    if unindexed:
        print(f"\nWarning: {len(unindexed)} files on disk not in index (leaving them)")

    # Step 4: Save clean index
    data['articles'] = keep
    data['totalPublished'] = len([a for a in keep if a['status'] == 'published'])
    data['lastUpdated'] = '2026-02-25T00:00:00Z'

    with open(INDEX_PATH, 'w') as f:
        json.dump(data, f, indent=2)

    remaining_files = len([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.md')])

    print(f"\nSummary:")
    print(f"  Orphan entries removed: {orphans}")
    print(f"  Duplicate files deleted: {deleted_files}")
    print(f"  Unique articles kept: {len(keep)}")
    print(f"  Published count: {data['totalPublished']}")
    print(f"  Files on disk: {remaining_files}")


if __name__ == '__main__':
    main()
