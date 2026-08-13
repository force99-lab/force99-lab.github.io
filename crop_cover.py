#!/usr/bin/env python3
"""分析波的叠加截图，裁剪出中间主波形区域。"""
from PIL import Image
import os

src = r"C:\Users\Administrator\Documents\xwechat_files\wxid_fxniy4kgi4u022_07ad\temp\RWTemp\2026-08\600dd469aa336f73bdb50aa6a9f5c840.jpg"
out = r"D:\work\2026-08-12-14-57-38\assets\img\wave-superposition-cover.png"

img = Image.open(src).convert("RGB")
w, h = img.size

# 分析每列亮度：背景黑（0,0,0），内容较亮
# 计算每列非近黑像素占比
from_col = []
for x in range(w):
    bright = 0
    for y in range(h):
        r, g, b = img.getpixel((x, y))
        if r > 40 or g > 40 or b > 40:
            bright += 1
    from_col.append(bright / h)

# 找左侧第一个内容占比超过阈值的列
threshold = 0.05
left = 0
for x in range(w):
    if from_col[x] > threshold:
        left = x
        break

# 找右侧最后一个内容占比超过阈值的列
right = w - 1
for x in range(w - 1, -1, -1):
    if from_col[x] > threshold:
        right = x
        break

# 上下边界：同理
from_row = []
for y in range(h):
    bright = 0
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        if r > 40 or g > 40 or b > 40:
            bright += 1
    from_row.append(bright / w)

top = 0
for y in range(h):
    if from_row[y] > threshold:
        top = y
        break

bottom = h - 1
for y in range(h - 1, -1, -1):
    if from_row[y] > threshold:
        bottom = y
        break

print(f"原始尺寸: {w}x{h}")
print(f"内容区域: x={left}-{right}, y={top}-{bottom}")

# 左侧文字面板较宽，取从波形开始出现的位置稍微向左留一点，向右全保留
# 如果左侧阈值找到的列在文字区外，可能需要额外裁掉文字区
# 这里采用列亮度的"显著变化"来排除左侧参数区
# 简单做法：如果 left 较小（<100），说明文字很靠边；实际文字延伸到约 220px
# 我们改为：找连续 50 列以上平均亮度 > 0.02 的起始区域作为真正主画面
run_start = 0
run_len = 0
best_start = 0
best_len = 0
for x in range(w):
    if from_col[x] > 0.02:
        if run_len == 0:
            run_start = x
        run_len += 1
        if run_len > best_len:
            best_len = run_len
            best_start = run_start
    else:
        run_len = 0

print(f"最长连续内容段: x={best_start}, 长度={best_len}")

# 主画面应该是最大的连续段，左侧小文字区可能单独成段
# 如果 best_start > 200 且前面还有小段，那么 best_start 就是主画面起点
# 否则需要手动调整

# 对于这张图，视觉判断主波形大约从 x=260 开始
# 左侧参数文字约在 x=0-220
# 我们采用 best_start 作为左边界（如果 best_start 足够大）
# 同时留少量边距
crop_left = max(0, best_start - 10)
crop_right = min(w - 1, right + 10)
crop_top = max(0, top - 10)
crop_bottom = min(h - 1, bottom + 10)

# 如果 best_start 仍然很小（左侧文字与波形连为一体），则使用固定偏移
if best_start < 200:
    crop_left = 260

print(f"裁剪区域: ({crop_left}, {crop_top}) -> ({crop_right}, {crop_bottom})")
print(f"裁剪后尺寸: {crop_right - crop_left + 1} x {crop_bottom - crop_top + 1}")

cropped = img.crop((crop_left, crop_top, crop_right + 1, crop_bottom + 1))
# 确保输出目录存在
os.makedirs(os.path.dirname(out), exist_ok=True)
cropped.save(out, "PNG")
print(f"已保存: {out}")
