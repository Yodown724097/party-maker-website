"""快速网络诊断"""
import sys, time, socket, requests
sys.stdout.reconfigure(encoding='utf-8')

host = 'pub-1fd965ab66464286847edcb540254451.r2.dev'
url = f'https://{host}/642257/01.jpg'

# 1. DNS
t0 = time.time()
try:
    ip = socket.gethostbyname(host)
    print(f'DNS: {time.time()-t0:.2f}s -> {ip}')
except Exception as e:
    print(f'DNS FAIL: {e}')

# 2. TCP
t0 = time.time()
s = socket.socket()
s.settimeout(10)
try:
    s.connect((host, 443))
    print(f'TCP: {time.time()-t0:.2f}s -> OK')
    s.close()
except Exception as e:
    print(f'TCP FAIL ({time.time()-t0:.2f}s): {e}')

# 3. HEAD
t0 = time.time()
try:
    r = requests.head(url, timeout=15)
    cl = r.headers.get('content-length', '?')
    print(f'HEAD: {time.time()-t0:.2f}s -> {r.status_code} ({cl} bytes)')
except Exception as e:
    print(f'HEAD FAIL ({time.time()-t0:.2f}s): {e}')

# 4. 小文件下载
t0 = time.time()
try:
    r = requests.get(url, timeout=15)
    sz = len(r.content)
    print(f'DOWNLOAD: {time.time()-t0:.2f}s -> {sz} bytes')
except Exception as e:
    print(f'DOWNLOAD FAIL ({time.time()-t0:.2f}s): {e}')

# 5. 对比百度速度
t0 = time.time()
try:
    r = requests.get('https://www.baidu.com', timeout=10)
    print(f'BAIDU: {time.time()-t0:.2f}s -> {r.status_code}')
except Exception as e:
    print(f'BAIDU FAIL: {e}')
