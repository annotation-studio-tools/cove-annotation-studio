"""Build the COVE extension ZIP using .NET 10 and the published COVE SDK."""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, subprocess, sys, zipfile

def bundle_frontend(root):
    modules=[]
    for name in ('model.mjs','exchange.mjs'):
        source=(root/'src'/name).read_text(encoding='utf-8')
        # These dependency-free modules intentionally share one frontend bundle.
        if re.search(r'^import\s', source, re.MULTILINE):
            raise ValueError(f'{name} must remain dependency-free or the bundler must be updated')
        modules.append(re.sub(r'^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)', '', source, flags=re.MULTILINE))
    source=(root/'src/studio.mjs').read_text(encoding='utf-8')
    source=re.sub(r'^import\s+[^;]+\s+from\s+[\'\"]\./(?:model|exchange)\.mjs[\'\"];?\s*$', '', source, flags=re.MULTILINE)
    if re.search(r'^import\s+[^;]+from\s+[\'\"]\.',source,re.MULTILINE):
        raise ValueError('Unbundled local frontend import')
    return '\n'.join([*modules,source])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet',default='dotnet',help='Path to the .NET 10 SDK executable')
    parser.add_argument('--output',type=Path,help='Output folder (defaults to artifacts/)')
    args=parser.parse_args()
    root=Path(__file__).resolve().parent
    out=(args.output or root/'artifacts').resolve();out.mkdir(parents=True,exist_ok=True)
    dotnet=shutil.which(args.dotnet)
    if not dotnet:parser.error('The .NET 10 SDK was not found. Install it or pass --dotnet /path/to/dotnet.')
    options={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}
    subprocess.run([dotnet,'build',str(root/'AnnotationStudio.csproj'),'-c','Release','--nologo'],cwd=root,check=True,**options)
    manifest=json.loads((root/'extension.json').read_text(encoding='utf-8'))
    files={'AnnotationStudio.dll':(root/'bin/Release/net10.0/AnnotationStudio.dll').read_bytes(),
           'extension.json':(root/'extension.json').read_bytes(),
           'studio.mjs':bundle_frontend(root).encode('utf-8'),
           'studio.css':(root/'src/studio.css').read_bytes(),
           'LICENSE':(root/'LICENSE').read_bytes()}
    archive=out/f'annotation-studio-{manifest["version"]}.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
        for name,data in files.items():
            info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16;bundle.writestr(info,data)
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum=archive.with_suffix('.zip.sha256');checksum.write_text(f'{digest}  {archive.name}\n',encoding='utf-8')
    (out/'studio.mjs').write_text(files['studio.mjs'].decode('utf-8'),encoding='utf-8')
    print(json.dumps({'package':str(archive),'sha256':digest}))

if __name__=='__main__':main()
