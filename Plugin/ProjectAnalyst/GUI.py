import tkinter as tk
from tkinter import filedialog, ttk
import re
import time
import threading

class ProgressMonitorApp:
    def __init__(self, master):
        self.master = master
        master.title("VCP Project Analyst 进度监控器")
        master.geometry("450x200")
        master.resizable(False, False)

        self.progress_var = tk.DoubleVar()
        self.status_text = tk.StringVar()
        self.status_text.set("等待日志文件...")
        self.log_file_path = None
        self.is_running = False

        style = ttk.Style()
        style.theme_use('clam')

        self.label = ttk.Label(master, textvariable=self.status_text, font=('Arial', 10))
        self.label.pack(pady=10)

        self.progressbar = ttk.Progressbar(master, orient="horizontal", length=400, mode="determinate", variable=self.progress_var)
        self.progressbar.pack(pady=10)

        self.select_button = ttk.Button(master, text="选择 VCP 日志文件", command=self.select_file)
        self.select_button.pack(pady=5)

        self.stop_button = ttk.Button(master, text="停止监控", command=self.stop_monitoring, state=tk.DISABLED)
        self.stop_button.pack(pady=5)

    def select_file(self):
        # 使用文件选择对话框模拟拖放
        self.log_file_path = filedialog.askopenfilename(
            defaultextension=".log",
            filetypes=[("日志文件", "*.log"), ("所有文件", "*.*")]
        )
        if self.log_file_path:
            self.status_text.set(f"已选择文件: {self.log_file_path.split('/')[-1]}")
            self.start_monitoring()

    def start_monitoring(self):
        if self.is_running:
            return
        self.is_running = True
        self.select_button.config(state=tk.DISABLED)
        self.stop_button.config(state=tk.NORMAL)
        
        # 启动后台线程进行文件轮询
        self.monitor_thread = threading.Thread(target=self.monitor_progress, daemon=True)
        self.monitor_thread.start()

    def stop_monitoring(self):
        self.is_running = False
        self.select_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
        self.status_text.set("监控已停止。")

    def monitor_progress(self):
        # 正则表达式匹配进度信息: "处理批次 X/Y"
        progress_pattern = re.compile(r"处理批次 (\d+)/(\d+)")
        
        current_batch = 0
        total_batches = 1

        while self.is_running:
            try:
                with open(self.log_file_path, 'r', encoding='utf-8') as f:
                    # 倒退读取，只检查文件末尾的最新日志
                    f.seek(0, 2)
                    file_size = f.tell()
                    f.seek(max(0, file_size - 8192), 0) # 倒退8KB
                    
                    lines = f.readlines()
                    
                    latest_progress_line = None
                    for line in reversed(lines):
                        match = progress_pattern.search(line)
                        if match:
                            latest_progress_line = line
                            current_batch = int(match.group(1))
                            total_batches = int(match.group(2))
                            break
                    
                    if latest_progress_line:
                        progress_percent = (current_batch / total_batches) * 100
                        
                        # 使用 master.after 确保在主线程更新 GUI
                        self.master.after(0, self.progress_var.set, progress_percent)
                        self.master.after(0, self.status_text.set, f"分析中: 批次 {current_batch}/{total_batches} ({progress_percent:.2f}%)")
                        
                        if current_batch >= total_batches:
                            self.master.after(0, self.status_text.set, "分析完成！")
                            self.master.after(0, self.stop_monitoring)
                            break

            except FileNotFoundError:
                self.master.after(0, self.status_text.set, "错误：日志文件未找到！")
                self.master.after(0, self.stop_monitoring)
                break
            except Exception as e:
                self.master.after(0, self.status_text.set, f"解析错误: {e}")
                self.master.after(0, self.stop_monitoring)
                break

            time.sleep(2)

if __name__ == "__main__":
    root = tk.Tk()
    app = ProgressMonitorApp(root)
    root.mainloop()