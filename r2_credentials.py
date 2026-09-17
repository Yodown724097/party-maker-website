"""R2 凭据加载器 —— 仓库里唯一读取密钥的地方，**本文件自身不含任何密钥**。

为什么有这个东西：
    2026-09-17 发现 upload_r2.py 等 8 个文件把 R2 Access Key / Secret 明文写死，
    而本仓库是 **public**，Cloudflare Pages 又把整个仓库当静态目录发布 →
    密钥在公网上躺了约 5 个月。修法就是把它挪进 .env（已被 .gitignore 忽略）。

取值优先级：**环境变量 > 同目录 .env 文件**
    .env 永不进 git、也不会被 Pages 发布；换机器时手动填一次即可。

用法：
    from r2_credentials import client, ENDPOINT, BUCKET
    s3 = client()                      # 已带好 endpoint / 签名 / region
    s3.head_object(Bucket=BUCKET, Key="605040/01.webp")
"""
import os
from pathlib import Path

_DIR = Path(__file__).resolve().parent
ENV_FILE = _DIR / ".env"


def _load_env_file(path=ENV_FILE):
    """把 .env 里 K=V 读进 os.environ（不覆盖已存在的环境变量）。"""
    if not path.exists():
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        # setdefault：环境变量优先，.env 只做兜底
        os.environ.setdefault(key, val)


_load_env_file()

# 端点与桶名不含密钥（本来就在公网 URL 里），给默认值方便直接跑
ENDPOINT = os.environ.get(
    "R2_ENDPOINT", "https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com"
)
BUCKET = os.environ.get("R2_BUCKET", "party-maker")

# 这两个才是机密 —— 缺了就直接报错，绝不静默降级成匿名请求
ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")


def _require_credentials():
    missing = [n for n, v in (("R2_ACCESS_KEY", ACCESS_KEY),
                              ("R2_SECRET_KEY", SECRET_KEY)) if not v]
    if missing:
        raise SystemExit(
            "缺少 R2 凭据：" + "、".join(missing) + "\n\n"
            f"请把它们写进 {ENV_FILE}（该文件已被 .gitignore 忽略，**切勿提交**）：\n"
            "    R2_ACCESS_KEY=<Access Key ID>\n"
            "    R2_SECRET_KEY=<Secret Access Key>\n\n"
            "或在 shell 里 export 同名环境变量后重跑。\n"
            "新凭据在 Cloudflare → R2 → Manage R2 API Tokens 创建。"
        )


def client(**overrides):
    """返回配置好的 boto3 S3 client（R2 用 region='auto' + sigv4）。

    overrides 会覆盖默认参数，例如 client(config=my_config)。
    boto3 在这里才 import：只读常量时不需要装 boto3。
    """
    _require_credentials()
    import boto3
    from botocore.config import Config

    opts = dict(
        endpoint_url=ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    opts.update(overrides)
    return boto3.client("s3", **opts)
