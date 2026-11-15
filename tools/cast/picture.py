"""Make one picture.   python3 picture.py <out file> <prompt file> [aspect] [input image ...]"""
import sys, pathlib, rep
out, prompt_file, aspect, *images = sys.argv[1:]
prompt = pathlib.Path(prompt_file).read_text().strip()
urls = [rep.upload(p) for p in images]
p = rep.run('google/nano-banana-pro', {'prompt': prompt, 'image_input': urls, 'aspect_ratio': aspect, 'resolution': '2K', 'output_format': 'png'}, note=pathlib.Path(out).name)
rep.fetch(rep.outputs(p)[0], out)
print('made', out, 'in', (p.get('metrics') or {}).get('predict_time'), 's')
