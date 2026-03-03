import sys
import json
import os
import requests
import base64
import time
import uuid
import re
import subprocess
import tempfile
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv
from datetime import datetime
import traceback
from urllib.parse import urlparse, urljoin
from urllib.request import url2pathname

# --- 自定义异常 (用于超栈追踪) ---
class LocalFileNotFoundError(Exception):
    def __init__(self, message, file_url):
        super().__init__(message)
        self.file_url = file_url

# --- 配置和常量 ---
LOG_FILE = "GrokVideoHistory.log"

# --- 日志记录 ---
def log_event(level, message, data=None):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    log_entry = f"[{timestamp}] [{level.upper()}] {message}"
    if data:
        try:
            log_entry += f" | Data: {json.dumps(data, ensure_ascii=False)}"
        except Exception:
            log_entry += f" | Data: [Unserializable Data]"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
    except Exception as e:
        print(f"Error writing to log file: {e}", file=sys.stderr)

# --- 结果输出 ---
def print_json_output(status, result=None, error=None, ai_message=None):
    output = {"status": status}
    if status == "success":
        if result is not None:
            output["result"] = result
        if ai_message:
            output["messageForAI"] = ai_message
    elif status == "error":
        if error is not None:
            output["error"] = error
    print(json.dumps(output, ensure_ascii=False))
    log_event("debug", "Output sent to stdout", output)

# --- 图片处理 ---
def image_to_base64(img):
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    img_bytes = buffer.getvalue()
    base64_encoded = base64.b64encode(img_bytes).decode('utf-8')
    return f"data:image/jpeg;base64,{base64_encoded}"

def process_image_from_base64(base64_str):
    try:
        log_event("info", f"Processing image from base64 string (length: {len(base64_str)})")
        if ',' in base64_str:
            header, encoded = base64_str.split(',', 1)
        else:
            encoded = base64_str
        
        img_data = base64.b64decode(encoded)
        img = Image.open(BytesIO(img_data))
        img = img.convert("RGB")
        return image_to_base64(img)
    except Exception as e:
        log_event("error", "Failed to process base64 image", {"error": str(e)})
        raise ValueError(f"处理 base64 图片失败: {e}")

def process_image_from_url(image_url):
    try:
        parsed_url = urlparse(image_url)
        img = None
        if parsed_url.scheme == 'file':
            log_event("info", f"Processing local file URL: {image_url}")
            # 处理 Windows 下不规范的 file:// 路径
            path = parsed_url.path
            if not path and parsed_url.netloc: # 处理 file://C:/path 这种 netloc 误判
                path = parsed_url.netloc + parsed_url.path
            
            file_path = url2pathname(path)
            if os.name == 'nt':
                # 移除开头的斜杠，例如 /C:/... -> C:/...
                file_path = re.sub(r'^/([a-zA-Z]:)', r'\1', file_path)
            
            log_event("info", f"Resolved local file path: {file_path}")

            try:
                with open(file_path, 'rb') as f:
                    img = Image.open(f)
                    img.load()
                log_event("info", f"Successfully opened local file: {file_path}")
            except FileNotFoundError:
                log_event("error", f"Local file not found: {file_path}. Signaling for remote fetch.")
                raise LocalFileNotFoundError("本地文件未找到，需要远程获取。", image_url)
        elif parsed_url.scheme in ['http', 'https']:
            log_event("info", f"Downloading image from URL: {image_url}")
            response = requests.get(image_url, stream=True, timeout=30)
            response.raise_for_status()
            img = Image.open(response.raw)
        else:
            raise ValueError(f"不支持的 URL 协议: {parsed_url.scheme}")

        if img is None:
            raise ValueError("未能加载图片。")
            
        img = img.convert("RGB")
        base64_image = image_to_base64(img)
        return base64_image
    except Exception as e:
        if isinstance(e, LocalFileNotFoundError):
            raise
        log_event("error", f"Failed to process image: {image_url}", {"error": str(e)})
        raise ValueError(f"图片处理失败: {e}")

# --- 视频续写功能 ---
def is_video_url(url):
    """判断 URL 是否指向视频文件（基于扩展名）"""
    try:
        parsed = urlparse(url)
        path = parsed.path.split('?')[0].lower()
        video_extensions = ('.mp4', '.webm', '.avi', '.mov', '.mkv')
        return path.endswith(video_extensions)
    except Exception:
        return False

def is_black_frame(img, threshold=15):
    """判断一帧是否是黑帧（平均亮度低于阈值，0-255 范围）"""
    grayscale = img.convert("L")
    pixels = list(grayscale.getdata())
    avg_brightness = sum(pixels) / len(pixels)
    log_event("debug", f"Frame brightness: {avg_brightness:.1f} (threshold: {threshold})")
    return avg_brightness < threshold

def download_source_video(video_url):
    """下载源视频到临时文件，返回临时文件路径。支持 http/https/file 协议。"""
    parsed = urlparse(video_url)
    
    if parsed.scheme == 'file':
        # 复用现有的 file:// 解析逻辑
        path = parsed.path
        if not path and parsed.netloc:
            path = parsed.netloc + parsed.path
        file_path = url2pathname(path)
        if os.name == 'nt':
            file_path = re.sub(r'^/([a-zA-Z]:)', r'\\1', file_path)
        
        if not os.path.exists(file_path):
            raise LocalFileNotFoundError("本地视频文件未找到，需要远程获取。", video_url)
        log_event("info", f"Using local video file: {file_path}")
        return file_path
    
    elif parsed.scheme in ['http', 'https']:
        log_event("info", f"Downloading source video for continuation: {video_url}")
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        
        # 写入临时文件
        tmp = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        try:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    tmp.write(chunk)
            tmp.flush()
            tmp.close()
            log_event("info", f"Source video downloaded to temp: {tmp.name}")
            return tmp.name
        except Exception:
            tmp.close()
            os.unlink(tmp.name)
            raise
    else:
        raise ValueError(f"不支持的视频 URL 协议: {parsed.scheme}")

def get_video_duration(video_path):
    """用 ffprobe 获取视频时长（秒）"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe 获取视频时长失败: {result.stderr.strip()}")
    duration = float(result.stdout.strip())
    log_event("info", f"Video duration: {duration:.2f}s")
    return duration

def extract_frame_at_time(video_path, timestamp):
    """用 ffmpeg 提取指定时间点的一帧，返回 PIL Image 对象"""
    cmd = [
        'ffmpeg', '-ss', str(max(0, timestamp)),
        '-i', video_path,
        '-frames:v', '1',
        '-f', 'image2pipe',
        '-vcodec', 'png',
        'pipe:1'
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=15)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg 提取帧失败 (t={timestamp:.2f}s): {result.stderr.decode('utf-8', errors='replace').strip()[-200:]}")
    if not result.stdout:
        raise RuntimeError(f"ffmpeg 未输出图像数据 (t={timestamp:.2f}s)")
    
    img = Image.open(BytesIO(result.stdout))
    return img.convert("RGB")

def extract_last_frame_from_video(video_path):
    """
    从视频提取最后一个非黑帧。
    策略：从最后一帧开始，如果是黑帧则每次往前跳 0.5 秒，最多尝试 5 次（回退 2.5 秒）。
    """
    duration = get_video_duration(video_path)
    
    max_retries = 5
    step_back = 0.5  # 每次往前跳 0.5 秒
    
    for attempt in range(max_retries):
        timestamp = duration - 0.05 - (attempt * step_back)  # 从末尾往前
        if timestamp < 0:
            timestamp = 0
        
        log_event("info", f"Extracting frame at t={timestamp:.2f}s (attempt {attempt + 1}/{max_retries})")
        frame = extract_frame_at_time(video_path, timestamp)
        
        if not is_black_frame(frame):
            log_event("info", f"Found valid (non-black) frame at t={timestamp:.2f}s")
            return frame
        else:
            log_event("info", f"Frame at t={timestamp:.2f}s is black, stepping back...")
        
        if timestamp <= 0:
            break
    
    # 如果所有尝试都是黑帧，使用中间位置的帧作为最后手段
    fallback_time = duration / 2
    log_event("warning", f"All frames were black, falling back to mid-point: t={fallback_time:.2f}s")
    return extract_frame_at_time(video_path, fallback_time)

def download_video_sync(url, task_id, save_dir):
    try:
        os.makedirs(save_dir, exist_ok=True)
        ext = "mp4"
        path_part = url.split('?')[0]
        if '.' in path_part:
            potential_ext = path_part.split('.')[-1].lower()
            if potential_ext in ['mp4', 'webp', 'png', 'jpg', 'jpeg', 'gif']:
                ext = potential_ext

        filename = f"grok_{task_id}.{ext}"
        filepath = os.path.join(save_dir, filename)

        log_event("info", f"Downloading video synchronously: {url} -> {filepath}")
        
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        return filename
    except Exception as e:
        log_event("error", f"Failed to download video: {e}")
        return None

# --- 视频拼接功能 ---
def concat_videos(video_urls, project_base_path, server_port, file_key, var_http_url):
    """
    将多个视频按顺序拼接为一个视频。
    使用 ffmpeg concat demuxer 实现无损拼接。
    """
    if not video_urls or len(video_urls) < 2:
        raise ValueError("视频拼接至少需要 2 个视频 URL。")
    
    task_id = str(uuid.uuid4())[:8]
    temp_dir = tempfile.mkdtemp(prefix='vcp_concat_')
    downloaded_files = []
    
    try:
        # 1. 下载所有源视频
        for i, url in enumerate(video_urls):
            url = url.strip()
            if not url:
                continue
            log_event("info", f"[{task_id}] Downloading video {i+1}/{len(video_urls)}: {url}")
            
            parsed = urlparse(url)
            if parsed.scheme == 'file':
                # 本地文件，直接解析路径
                path = parsed.path
                if not path and parsed.netloc:
                    path = parsed.netloc + parsed.path
                file_path = url2pathname(path)
                if os.name == 'nt':
                    file_path = re.sub(r'^/([a-zA-Z]:)', r'\\1', file_path)
                if not os.path.exists(file_path):
                    raise LocalFileNotFoundError(f"本地视频文件未找到: {file_path}", url)
                downloaded_files.append(file_path)
            elif parsed.scheme in ['http', 'https']:
                # 下载到临时目录
                local_path = os.path.join(temp_dir, f"input_{i}.mp4")
                response = requests.get(url, stream=True, timeout=60)
                response.raise_for_status()
                with open(local_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                downloaded_files.append(local_path)
                log_event("info", f"[{task_id}] Downloaded to: {local_path}")
            else:
                raise ValueError(f"不支持的视频 URL 协议: {parsed.scheme} (video {i+1})")
        
        if len(downloaded_files) < 2:
            raise ValueError("有效视频不足 2 个，无法拼接。")
        
        # 2. 创建 ffmpeg concat 列表文件
        concat_list_path = os.path.join(temp_dir, 'concat_list.txt')
        with open(concat_list_path, 'w', encoding='utf-8') as f:
            for vpath in downloaded_files:
                # ffmpeg concat 要求路径用单引号转义
                escaped_path = vpath.replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")
        
        log_event("info", f"[{task_id}] Concat list created with {len(downloaded_files)} videos")
        
        # 3. 确定输出路径
        output_filename = f"grok_concat_{task_id}.mp4"
        if project_base_path:
            video_save_dir = os.path.join(project_base_path, 'file', 'video')
            os.makedirs(video_save_dir, exist_ok=True)
            output_path = os.path.join(video_save_dir, output_filename)
        else:
            output_path = os.path.join(temp_dir, output_filename)
        
        # 4. 执行 ffmpeg 拼接（使用 concat demuxer + 重编码确保兼容性）
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_list_path,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            output_path
        ]
        
        log_event("info", f"[{task_id}] Running ffmpeg concat: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg 拼接失败: {result.stderr.strip()[-300:]}")
        
        log_event("info", f"[{task_id}] Concat complete: {output_path}")
        
        # 5. 构建可访问的 URL
        accessible_url = output_path  # fallback
        local_path_relative = None
        
        if project_base_path and server_port and file_key and var_http_url:
            accessible_url = f"{var_http_url}:{server_port}/pw={file_key}/files/video/{output_filename}"
            local_path_relative = f"file/video/{output_filename}"
            log_event("info", f"[{task_id}] Concat accessible URL: {accessible_url}")
        
        ai_msg = f"视频拼接成功！共 {len(downloaded_files)} 个视频已合并。\n拼接视频 URL: {accessible_url}"
        
        print_json_output("success", result={
            "video_url": accessible_url,
            "local_path": local_path_relative,
            "video_count": len(downloaded_files),
            "requestId": task_id
        }, ai_message=ai_msg)
        
    finally:
        # 清理临时目录（但不删除 file:// 指向的原始文件）
        import shutil
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

# --- 主逻辑 ---
def main():
    dotenv_path = os.path.join(os.path.dirname(__file__), 'config.env')
    load_dotenv(dotenv_path=dotenv_path)
    
    api_key = os.getenv("GROK_API_KEY")
    api_base = os.getenv("GROK_API_BASE", "https://api.x.ai")
    model = os.getenv("GrokVideoModelName", "grok-imagine-0.9")
    
    # 从环境变量获取 VCP 配置 (由 Plugin.js 注入)
    project_base_path = os.getenv("PROJECT_BASE_PATH")
    server_port = os.getenv("PORT")
    imageserver_file_key = os.getenv("FILE_KEY") # 视频应该使用 File_Key
    var_http_url = os.getenv("VarHttpUrl")

    # 读取输入
    try:
        input_str = sys.stdin.read()
        if not input_str:
            sys.exit(0)
        input_data = json.loads(input_str)
    except Exception as e:
        print_json_output("error", error=f"Invalid JSON input: {e}")
        sys.exit(1)

    # 路由命令：concat 不需要 API Key
    command = input_data.get("command", "submit")
    
    if command == "concat":
        try:
            # 收集所有 video_url 参数（video_url1, video_url2, ... 或 video_urls 数组）
            video_urls = input_data.get("video_urls", [])
            if not video_urls:
                # 兼容 video_url1, video_url2, ... 的写法
                i = 1
                while True:
                    url = input_data.get(f"video_url{i}")
                    if not url:
                        break
                    video_urls.append(url)
                    i += 1
            
            concat_videos(video_urls, project_base_path, server_port, imageserver_file_key, var_http_url)
        except LocalFileNotFoundError as e:
            error_payload = {
                "status": "error",
                "code": "FILE_NOT_FOUND_LOCALLY",
                "error": str(e),
                "fileUrl": e.file_url
            }
            print(json.dumps(error_payload, ensure_ascii=False))
            sys.exit(1)
        except Exception as e:
            log_event("error", f"Concat failed", {"error": str(e), "traceback": traceback.format_exc()})
            print_json_output("error", error=str(e))
            sys.exit(1)
        return
    
    # submit 命令需要 API Key
    if not api_key:
        print_json_output("error", error="GROK_API_KEY not found in config.env.")
        sys.exit(1)

    # submit 命令的主逻辑

    image_url = input_data.get("image_url")
    video_url_input = input_data.get("video_url")  # 视频续写专用字段
    image_base64_input = input_data.get("image_base64")
    prompt = input_data.get("prompt")
    task_id = str(uuid.uuid4())[:8]
    is_continuation = False  # 标记是否为视频续写模式
    source_video_url = None

    try:
        if not prompt:
            raise ValueError("Missing prompt")
        # 1. 处理图片/视频 (可选)
        image_base64 = None
        
        if video_url_input and isinstance(video_url_input, str) and video_url_input.strip():
            # === 视频续写模式 ===
            log_event("info", f"[{task_id}] Video continuation mode activated: {video_url_input}")
            source_video_url = video_url_input.strip()
            temp_video_path = download_source_video(source_video_url)
            try:
                last_frame = extract_last_frame_from_video(temp_video_path)
                image_base64 = image_to_base64(last_frame)
                is_continuation = True
                log_event("info", f"[{task_id}] Successfully extracted last frame for continuation")
            finally:
                # 清理临时文件（仅当是下载的 http 文件时才删除）
                parsed_source = urlparse(source_video_url)
                if parsed_source.scheme in ['http', 'https'] and os.path.exists(temp_video_path):
                    try:
                        os.unlink(temp_video_path)
                        log_event("debug", f"Cleaned up temp video: {temp_video_path}")
                    except Exception:
                        pass
        elif image_base64_input:
            image_base64 = process_image_from_base64(image_base64_input)
        elif image_url and isinstance(image_url, str) and image_url.strip():
            image_base64 = process_image_from_url(image_url)

        # 2. 调用 Grok API (同步等待)
        # 自动处理 URL 拼接，确保包含 v1/chat/completions
        base_url = api_base.rstrip('/')
        if not base_url.endswith('/v1'):
            if not base_url.endswith('/v1/chat/completions'):
                api_url = f"{base_url}/v1/chat/completions"
            else:
                api_url = base_url
        else:
            api_url = f"{base_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        # 明确要求生成视频
        video_prompt = f"{prompt} (Please generate a video based on this description)"
        content_list = [{"type": "text", "text": video_prompt}]
        if image_base64:
            content_list.append({"type": "image_url", "image_url": {"url": image_base64}})

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": content_list
                }
            ]
        }

        log_event("info", f"[{task_id}] Calling Grok API (Synchronous)", {"url": api_url, "model": model})
        response = requests.post(api_url, json=payload, headers=headers, timeout=300)
        
        if response.status_code != 200:
            log_event("error", f"[{task_id}] API request failed with status {response.status_code}", {"text": response.text[:1000]})
            response.raise_for_status()

        response_text = response.text
        video_url = None
        content = ""
        
        try:
            # 1. 优先尝试标准 JSON 解析
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not video_url:
                video_url = result.get("video_url") # 备选方案
        except json.JSONDecodeError:
            # 2. 尝试解析 SSE 流式响应
            log_event("info", f"[{task_id}] Failed to parse as standard JSON, trying SSE stream parsing")
            lines = response_text.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith("data: "):
                    content_str = line[6:].strip()
                    if content_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(content_str)
                        if "choices" in chunk and chunk["choices"]:
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta:
                                content += delta["content"]
                    except:
                        continue

        # 3. 如果通过JSON或SSE获取到了内容，提取其中的URL
        if content and not video_url:
            # 修改1: 主提取 - 只找 .mp4
            url_match = re.search(
                r'(https?://[^\s<>"\']+\.mp4[^\s<>"\']*)',
                content, re.IGNORECASE
            )
            if url_match:
                video_url = url_match.group(1)
            
            if not video_url:
                # 修改2: HTML标签提取 - 只找 .mp4
                html_match = re.search(
                    r'src=["\']([^"\'>]+\.mp4[^"\'>]*)["\']',
                    content, re.IGNORECASE
                )
                if html_match:
                    video_url = html_match.group(1)
                    
            if not video_url:
                # 修改3: Markdown提取 - 只找 .mp4
                md_match = re.search(
                    r'!?\[[^\]]*\]\(([^\)]+\.mp4[^\)]*)\)',
                    content, re.IGNORECASE
                )
                if md_match:
                    video_url = md_match.group(1)

        # 4. 最后一道防线：对整个原始文本进行暴力正则提取 (修改4: 也只找 .mp4)
        if not video_url:
            log_event("info", f"[{task_id}] Fallback to regex extraction directly from response text")
            url_match = re.search(
                r'(https?://[^\s<>"\']+\.mp4[^\s<>"\']*)',
                response_text, re.IGNORECASE
            )
            if url_match:
                video_url = url_match.group(1)

        if video_url:
            log_event("success", f"[{task_id}] Video URL obtained: {video_url}")
            
            # 4. 同步下载并转化为本地 URL
            local_filename = None
            accessible_url = video_url
            
            if project_base_path and server_port and imageserver_file_key and var_http_url:
                video_save_dir = os.path.join(project_base_path, 'file', 'video')
                local_filename = download_video_sync(video_url, task_id, video_save_dir)
                
                if local_filename:
                    # 构建本地局域网 URL
                    # 根据 image-server.js 的逻辑：
                    # app.use('/:pathSegmentWithKey/files', ...) 映射到 projectBasePath/file
                    # 所以访问 file/video/xxx.mp4 应该是 /pw=KEY/files/video/xxx.mp4
                    
                    accessible_url = f"{var_http_url}:{server_port}/pw={imageserver_file_key}/files/video/{local_filename}"
                    log_event("info", f"[{task_id}] Local accessible URL: {accessible_url}")

            ai_msg = f"Grok 视频生成成功！\n视频已下载并转化为本地 URL: {accessible_url}"
            if is_continuation:
                ai_msg = f"Grok 视频续写成功！（基于源视频最后一帧继续创作）\n续写视频 URL: {accessible_url}\n源视频: {source_video_url}"
            elif accessible_url != video_url:
                ai_msg += f"\n原始 URL: {video_url}"
                
            result_data = {
                "video_url": accessible_url,
                "original_url": video_url,
                "local_path": f"file/video/{local_filename}" if local_filename else None,
                "requestId": task_id
            }
            if is_continuation:
                result_data["continuation"] = True
                result_data["source_video"] = source_video_url
            
            print_json_output("success", result=result_data, ai_message=ai_msg)
        else:
            raise ValueError(f"未能从 API 响应中提取视频 URL。内容: {content[:200]}")

    except LocalFileNotFoundError as e:
        # 超栈追踪：抛出特定格式的 JSON 引导主服务处理
        error_payload = {
            "status": "error",
            "code": "FILE_NOT_FOUND_LOCALLY",
            "error": str(e),
            "fileUrl": e.file_url
        }
        # 确保这是标准输出的唯一内容
        print(json.dumps(error_payload, ensure_ascii=False))
        sys.exit(1) # 使用非零状态码表示需要主服务介入
    except Exception as e:
        log_event("error", f"[{task_id}] Processing failed", {"error": str(e), "traceback": traceback.format_exc()})
        print_json_output("error", error=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()