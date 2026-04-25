import json
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Read local file
with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products-public.json', 'r', encoding='utf-8') as f:
    local_data = json.load(f)
print(f"Local products-public.json: {len(local_data['products'])} products")

# Read git HEAD version
result = subprocess.run(
    ['git', '-C', r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website',
     'show', 'HEAD:products-public.json'],
    capture_output=True, text=True, encoding='utf-8'
)
if result.returncode == 0:
    git_data = json.loads(result.stdout)
    print(f"Git HEAD products-public.json: {len(git_data['products'])} products")
    
    if len(local_data['products']) == len(git_data['products']):
        print("Local and Git HEAD are the SAME")
    else:
        print("MISMATCH! Local and Git HEAD are different!")
        print(f"  Local: {len(local_data['products'])}")
        print(f"  Git HEAD: {len(git_data['products'])}")
else:
    print(f"Error reading git version: {result.stderr}")
