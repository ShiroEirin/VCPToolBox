import glob
import os

target_dir = os.path.dirname(os.path.abspath(__file__))
md_files = glob.glob(os.path.join(target_dir, "**/*.md"), recursive=True)

count = 0
for filepath in md_files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    if "Nova[image]" in content:
        new_content = content.replace("Nova[image]", "Nova")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        count += 1
        print(f"  [OK] {os.path.basename(filepath)}")

print(f"\n完成！共修改 {count} 个文件")
