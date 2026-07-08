#!/usr/bin/env python3
"""
VPS Daily Blog Deploy Script
- Pulls latest blog_queue.json from git
- Takes 1 blog post from the queue
- Creates blog HTML file, adds to blog.json
- Runs build_pages.py
- Git commit + push

Usage: python3 vps_blog_daily.py
Cron: 0 9 * * * cd /path/to/repo && python3 .workbuddy/vps_blog_daily.py
"""

import json, os, sys, subprocess
from datetime import datetime

QUEUE_FILE = '.workbuddy/blog_queue.json'
BLOG_JSON = 'blog.json'
BLOG_DIR = 'blog'

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                           cwd=os.path.dirname(os.path.abspath(__file__)) + '/..')
    if result.returncode != 0:
        print(f"ERROR: {cmd}\n{result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

# 1. Pull latest
print("[1] git pull...")
run("git pull origin main")

# 2. Load queue
if not os.path.exists(QUEUE_FILE):
    print("No blog_queue.json found. Nothing to deploy.")
    sys.exit(0)

with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
    queue = json.load(f)

if not queue:
    print("Blog queue is empty. All done!")
    sys.exit(0)

# 3. Take first blog post
post = queue.pop(0)
slug = post['slug']

print(f"[2] Deploying blog post: {slug}")
print(f"    Title: {post['title'][:60]}...")

# 4. Create blog HTML file
blog_html_dir = os.path.join(BLOG_DIR, slug)
os.makedirs(blog_html_dir, exist_ok=True)

html_path = os.path.join(blog_html_dir, 'index.html')

# Generate HTML from blog.json body
body_html = []
for item in post['body']:
    if item['type'] == 'h2':
        body_html.append(f'<h2>{item["content"]}</h2>')
    elif item['type'] == 'img':
        body_html.append(f'<img src="{item["src"]}" alt="{item.get("alt","")}" loading="lazy">')
    elif item['type'] == 'p':
        body_html.append(f'<p>{item["content"]}</p>')

# Fix: use today's actual date for publish date, not the hardcoded generation date
publish_date = datetime.now().strftime('%Y-%m-%d')
post['date'] = publish_date

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{post['title']}</title>
<meta name="description" content="{post['meta_desc']}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.partymaker.cn/blog/{slug}/">
</head>
<body>
<article>
<h1>{post['title']}</h1>
<p class="date">{publish_date} | {post['category']}</p>
{chr(10).join(body_html)}
<p class="cta">For wholesale inquiries, custom orders, or samples, contact <a href="mailto:info@partymaker.cn">info@partymaker.cn</a></p>
</article>
</body>
</html>
"""

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"[3] Created blog HTML: {html_path}")

# 5. Add to blog.json
if os.path.exists(BLOG_JSON):
    with open(BLOG_JSON, 'r', encoding='utf-8') as f:
        blog_list = json.load(f)
    blog_list.append(post)
else:
    blog_list = [post]

with open(BLOG_JSON, 'w', encoding='utf-8') as f:
    json.dump(blog_list, f, ensure_ascii=False, indent=2)

print(f"[4] Added to blog.json (total: {len(blog_list)} posts)")

# 6. Update queue file (remove deployed post)
with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
    json.dump(queue, f, ensure_ascii=False, indent=2)

# 7. Build pages
print("[5] Running build_pages.py...")
run("python3 build_pages.py")

# 8. Git add & commit
today = datetime.now().strftime('%Y-%m-%d')
run(f"git add {html_path} {BLOG_JSON} blog/ blog/index.html blog.json sitemap.xml .build_cache.json .workbuddy/blog_queue.json")
commit_msg = f"blog: publish '{post['title'][:50]}' ({today})"
run(f'git commit -m "{commit_msg}"')

# 9. Push
print("[6] git push...")
run("git push origin main")

print(f"\nDONE: Published blog post '{slug}'")
print(f"Remaining in queue: {len(queue)} posts")
print(f"Total blog posts: {len(blog_list)}")
