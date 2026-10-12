"""Sube el número de versión en todo el sitio: version.txt, las páginas (?v=N y V = 'N') y los import entre módulos.
Así el navegador descarga todos los archivos nuevos juntos y no mezcla una versión con otra.
Uso: python3 subir-version.py"""
import pathlib, re
raiz = pathlib.Path(__file__).parent
n = int((raiz / 'version.txt').read_text().strip()) + 1
(raiz / 'version.txt').write_text(f'{n}\n')
for p in list(raiz.glob('*.html')) + list((raiz / 'js').glob('*.js')):
    if p.name == 'firebase-sdk.js':
        continue
    s = p.read_text(encoding='utf-8')
    s2 = re.sub(r"var V = '\d+'", f"var V = '{n}'", s)
    s2 = re.sub(r'(\.(?:js|css))\?v=\d+', rf'\1?v={n}', s2)
    s2 = re.sub(r"(from '\./[\w-]+\.js)(?:\?v=\d+)?'", rf"\1?v={n}'", s2)
    if s2 != s:
        p.write_text(s2, encoding='utf-8')
print('versión', n)
