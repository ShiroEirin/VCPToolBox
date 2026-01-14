import sys
import os
import requests
import time

def download_video(url, task_id):
    # 1. 全局硬超时 (10 分钟) 防止僵尸进程
    GLOBAL_TIMEOUT = 10 * 60
    start_time = time.time()

    try:
        # 获取目录
        script_dir = os.path.dirname(os.path.abspath(__file__))
        video_dir = os.path.normpath(os.path.join(script_dir, '..', '..', 'file', 'video'))
        os.makedirs(video_dir, exist_ok=True)

        # 从 URL 中提取后缀名，默认为 mp4
        ext = "mp4"
        path_part = url.split('?')[0]
        if '.' in path_part:
            potential_ext = path_part.split('.')[-1].lower()
            if potential_ext in ['mp4', 'webp', 'png', 'jpg', 'jpeg', 'gif']:
                ext = potential_ext

        filename = f"grok_{task_id}.{ext}"
        filepath = os.path.join(video_dir, filename)

        print(f"[Downloader] Starting download for task {task_id} (ext: {ext}): {url}")
        
        # 2. 流式下载
        with requests.get(url, stream=True, timeout=30) as r:
            r.raise_for_status()
            with open(filepath, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    # 检查是否超时
                    if time.time() - start_time > GLOBAL_TIMEOUT:
                        print(f"[Downloader] Task {task_id} timed out. Force exiting.")
                        sys.exit(1)
                    if chunk:
                        f.write(chunk)

        print(f"[Downloader] Successfully downloaded: {filepath}")
        sys.exit(0)
    except Exception as e:
        print(f"[Downloader] Failed to download video for task {task_id}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python video_downloader.py <url> <taskId>")
        sys.exit(1)

    url = sys.argv[1]
    task_id = sys.argv[2]
    download_video(url, task_id)