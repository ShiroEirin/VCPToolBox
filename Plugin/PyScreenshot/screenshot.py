import sys
import json
import base64
import os
import requests
from datetime import datetime
from PIL import ImageGrab
import io

def get_image_description(base64_image_data, mime_type):
    """
    Calls the multimodal AI model to get a description of the image.
    Reads configuration from environment variables.
    """
    api_url = os.getenv("API_URL")
    api_key = os.getenv("API_Key")
    model = os.getenv("MultiModalModel")
    prompt = os.getenv("MultiModalPrompt")
    max_tokens = int(os.getenv("MultiModalModelOutputMaxTokens", 50000))

    if not all([api_url, api_key, model, prompt]):
        return "[初步分析失败：AI视觉模块未配置。请您直接分析以下图片内容。]"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    data_uri = f"{mime_type};base64,{base64_image_data}"

    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_uri}}
            ]
        }],
        "max_tokens": max_tokens,
    }

    try:
        response = requests.post(f"{api_url}/v1/chat/completions", headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        description = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        return description if description else "[初步分析失败：AI视觉模块返回了空内容。请您直接分析以下图片内容。]"
    except requests.exceptions.RequestException as e:
        error_type = e.__class__.__name__
        return f"[初步分析失败：遇到网络请求错误 ({error_type})。请您直接分析以下图片内容。]"
    except Exception as e:
        return f"[初步分析失败：遇到未知错误 ({e.__class__.__name__})。请您直接分析以下图片内容。]"


def save_image_to_file(buffer, save_path_dir):
    """Saves the image buffer to a file and returns the full path and filename."""
    if not save_path_dir or not save_path_dir.strip():
        return "", ""
    try:
        os.makedirs(save_path_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshot_{timestamp}.jpg"
        saved_file_path = os.path.join(save_path_dir, filename)
        with open(saved_file_path, "wb") as f:
            f.write(buffer)
        return saved_file_path, filename
    except Exception as e:
        return f"[Failed to save file: {str(e)}]", ""

def main():
    try:
        # --- Core Screenshot Logic ---
        screenshot = ImageGrab.grab()
        # Convert PIL image to JPEG bytes
        buf = io.BytesIO()
        screenshot.save(buf, format='JPEG')
        buffer = buf.getvalue()

        # --- Read Configuration ---
        processing_mode = os.getenv("PROCESSING_MODE", "full_analysis").strip('"')
        save_path_dir = os.getenv("SAVE_PATH")

        # --- Save File (common to all modes that save) ---
        saved_file_path, saved_filename = save_image_to_file(buffer, save_path_dir)

        # --- Mode-Dependent Processing ---
        if processing_mode == "full_analysis":
            # --- URL Construction & Content Generation ---
            base64_image = base64.b64encode(buffer).decode('utf-8')
            image_url_for_ai = f"data:image/jpeg;base64,{base64_image}"

            display_url = ""
            if saved_file_path and "[Failed" not in saved_file_path:
                is_relative_to_vcp = os.path.abspath(saved_file_path).startswith(os.path.abspath(os.getcwd()))
                if is_relative_to_vcp and 'image' in saved_file_path:
                    var_http_url = os.getenv("VarHttpUrl")
                    server_port = os.getenv("SERVER_PORT")
                    image_key = os.getenv("IMAGESERVER_IMAGE_KEY")
                    if all([var_http_url, server_port, image_key]):
                        relative_url_path = os.path.join('PyScreenshot', saved_filename).replace('\\', '/')
                        display_url = f"{var_http_url}:{server_port}/pw={image_key}/images/{relative_url_path}"
                else:
                    display_url = f"file:///{os.path.abspath(saved_file_path).replace('\\', '/')}"
            
            description = get_image_description(base64_image, "data:image/jpeg")
            
            final_text = f"已成功截取屏幕图像并进行了分析。\n\n**图像描述:**\n{description}"
            if saved_file_path and "[Failed" not in saved_file_path:
                final_text += f"\n\n**文件已保存至:**\n`{saved_file_path}`"
            if display_url:
                 final_text += f"\n\n**可访问链接:**\n{display_url}"

            result = {
                "content": [
                    {"type": "text", "text": final_text},
                    {"type": "image_url", "image_url": {"url": image_url_for_ai}}
                ]
            }

        elif processing_mode == "direct_to_ai":
            # --- URL Construction ---
            var_http_url = os.getenv("VarHttpUrl")
            server_port = os.getenv("SERVER_PORT")
            image_key = os.getenv("IMAGESERVER_IMAGE_KEY")
            image_url_for_ai = ""
            if saved_filename and all([var_http_url, server_port, image_key]):
                relative_url_path = os.path.join('PyScreenshot', saved_filename).replace('\\', '/')
                image_url_for_ai = f"{var_http_url}:{server_port}/pw={image_key}/images/{relative_url_path}"
            else:
                base64_image = base64.b64encode(buffer).decode('utf-8')
                image_url_for_ai = f"data:image/jpeg;base64,{base64_image}"

            final_text = f"已成功截取屏幕图像，请直接查看。"
            if saved_file_path and "[Failed" not in saved_file_path:
                final_text += f"\n\n**文件已保存至:**\n`{saved_file_path}`"
            if "http" in image_url_for_ai:
                 final_text += f"\n\n**公开访问URL:**\n{image_url_for_ai}"

            result = {
                "content": [
                    {"type": "text", "text": final_text},
                    {"type": "image_url", "image_url": {"url": image_url_for_ai}}
                ]
            }

        else: # capture_only
            final_text = f"已成功截取屏幕图像。"
            if saved_file_path and "[Failed" not in saved_file_path:
                final_text += f"\n文件已保存至: `{saved_file_path}`"
            elif saved_file_path: # Handle save error
                final_text += f"\n{saved_file_path}"
            result = final_text
        
        output = {"status": "success", "result": result}

    except Exception as e:
        output = {
            "status": "error",
            "error": {
                "code": e.__class__.__name__,
                "message": str(e)
            }
        }
        print(json.dumps(output), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(output))
    sys.exit(0)

if __name__ == "__main__":
    main()
