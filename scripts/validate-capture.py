"""GitHub-runner image gate. OCR is local to the runner; no image is sent to an AI."""
import base64, io, json, os, re, sys, unicodedata
from PIL import Image, ImageDraw, ImageStat, ImageChops, ImageOps
import pytesseract

VERSION='1'
LABELS={'balance':{'balance','saldo','credit','credits','credito','creditos'},
        'bet':{'bet','apuesta','stake'},'spin':{'spin','girar'},
        'menu':{'menu'},'buy':{'buy','comprar'},
        'start':{'start','continue','continuar','comenzar','iniciar'}}
def normalized(text):
 return ''.join(c for c in unicodedata.normalize('NFD',text.lower()) if unicodedata.category(c)!='Mn')
def crop(image,rect):
 x,y,w,h=rect;return image.crop((round(x*image.width),round(y*image.height),round((x+w)*image.width),round((y+h)*image.height)))
def dhash(image):
 pixels=list(image.convert('L').resize((9,8)).getdata())
 return sum((1<<i) for i in range(64) if pixels[(i//8)*9+i%8]>pixels[(i//8)*9+i%8+1])
def read_words(image):
 words=[]
 # Scan the whole image plus enlarged toolbar/action areas. Coordinates always
 # map back to this game's original JPEG, never to another provider's layout.
 for region,scale,psm in [((0,0,1,1),1,11),((0,.68,1,.32),2,6),((.12,.56,.76,.42),2,11)]:
  part=crop(image,region)
  if scale!=1:part=ImageOps.autocontrast(part.convert('L')).resize((part.width*scale,part.height*scale))
  data=pytesseract.image_to_data(part,lang='eng+spa',config='--psm '+str(psm),output_type=pytesseract.Output.DICT,timeout=10)
  for i,word in enumerate(data['text']):
   if not word.strip() or float(data['conf'][i])<25:continue
   entry={'word':normalized(word.strip()),'x':region[0]*image.width+data['left'][i]/scale,'y':region[1]*image.height+data['top'][i]/scale,'w':data['width'][i]/scale,'h':data['height'][i]/scale,'confidence':float(data['conf'][i])}
   existing=next((w for w in words if w['word']==entry['word'] and abs(w['x']-entry['x'])<12 and abs(w['y']-entry['y'])<8),None)
   if existing is None:words.append(entry)
   elif entry['confidence']>existing['confidence']:existing.update(entry)
 return words
def analyze(image,*,provider,game_id,reference=None):
 image=image.convert('RGB')
 result={'validatorVersion':VERSION,'provider':provider,'gameId':game_id,'status':'uncertain','reasons':[],'anchors':[]}
 if image.width<160 or image.height<140 or max(ImageStat.Stat(image.resize((64,64))).stddev)<4:
  result['reasons']=['empty-or-small-image'];return result
 words=read_words(image)
 text=' '.join(w['word'] for w in words)
 blockers=[('blocked',r'not available in your country|geograph|access denied|attention required|restricted|no esta disponible|blocked|forbidden'),
           ('loading',r'loading|please wait|cargando|initializ|inicializ'),
           ('overlay',r'accept cookies|reject cookies|cookie settings|aceptar cookies|configurar cookies|legal gambling age|confirm your age|you must be over')]
 for status,pattern in blockers:
  if re.search(pattern,text):result.update(status=status,reasons=[status+'-screen']);return result
 if len(re.findall(r'\b\d+[,.]\d{2}\b',text))>=8 and re.search(r'\b(lineas|lines|apuesta|bet)\b',text):
  result.update(status='overlay',reasons=['stake-selection-covers-game']);return result
 seen=set()
 for word in sorted(words,key=lambda w:w['confidence'],reverse=True):
  token=re.sub(r'[^a-z]','',word['word'])
  for role,labels in LABELS.items():
   if token not in labels or role in seen:continue
   x=max(0,word['x']-6);y=max(0,word['y']-6)
   width=min(image.width-x,word['w']+12);height=min(image.height-y,word['h']+12)
   result['anchors'].append({'role':role,'rect':[x/image.width,y/image.height,width/image.width,height/image.height],'matched':False})
   seen.add(role)
 if 'start' not in seen and re.search(r'(click|tap)\s+anywhere',text):
  word=next(w for w in words if re.sub(r'[^a-z]','',w['word']) in ('click','tap'))
  result['anchors'].append({'role':'start','rect':[word['x']/image.width,word['y']/image.height,min(.4,1-word['x']/image.width),min(.08,1-word['y']/image.height)],'matched':False});seen.add('start')
 if reference:
  if reference.get('provider')!=provider or reference.get('gameId')!=game_id:
   result['reasons']=['reference-game-mismatch'];return result
  if 'start' in seen and len(seen&{'balance','bet','spin'})<2:
   result.update(status='intro',reasons=['actionable-intro-not-base']);return result
  baseline=Image.open(io.BytesIO(base64.b64decode(reference['image']))).convert('RGB')
  if abs((image.width/image.height)/(baseline.width/baseline.height)-1)>.05:
   result['reasons']=['reference-layout-mismatch'];return result
  matches=[]
  for anchor in reference.get('anchors',[])[:12]:
   current=crop(image,anchor['rect']);expected=crop(baseline,anchor['rect'])
   distance=(dhash(current)^dhash(expected)).bit_count()
   matched=max(ImageStat.Stat(expected).stddev)>12 and max(ImageStat.Stat(current).stddev)>12 and distance<=14
   matches.append({'role':anchor['role'],'rect':anchor['rect'],'distance':distance,'matched':matched})
  result['anchors']=matches
  scene=(.18,.18,.64,.60)
  current_scene=crop(image,scene).resize((64,48));baseline_scene=crop(baseline,scene).resize((64,48))
  scene_delta=sum(ImageStat.Stat(ImageChops.difference(current_scene,baseline_scene)).mean)/3
  scene_distance=(dhash(current_scene)^dhash(baseline_scene)).bit_count()
  if scene_delta>30 or scene_distance>24:
   result['reasons']=['central-scene-changed'];return result
  if reference.get('stage')=='intro' and any(a['role']=='start' and a['matched'] for a in matches):
   result.update(status='intro',reasons=['approved-intro-control-match']);return result
  if len({a['role'] for a in matches if a['matched']}&{'balance','bet','spin'})>=2:
   result.update(status='ready',reasons=['same-game-instruments-match']);return result
  result['reasons']=['reference-instruments-missing'];return result
 instruments=seen&{'balance','bet','spin'}
 if len(instruments)>=2:
  result.update(status='ready',reasons=['visible-distinct-instruments','no-approved-reference-yet'])
 elif 'start' in seen:
  result.update(status='intro',reasons=['actionable-intro-not-base'])
 else:result['reasons']=['insufficient-visible-instruments']
 return result

def preview(image,result,reference=None):
 width=1000;height=round(image.height*width/image.width);margin=62
 canvas=Image.new('RGB',(width*2,height+margin),'#17202a');draw=ImageDraw.Draw(canvas)
 color='#36d06a' if result['status'] in ('ready','intro') else '#ff6c65'
 for index,(source,anchors) in enumerate([(image,result['anchors']),(reference and Image.open(io.BytesIO(base64.b64decode(reference['image']))),reference.get('anchors',[]) if reference else [])]):
  if source is None:continue
  rendered=source.convert('RGB').resize((width,height));canvas.paste(rendered,(index*width,margin))
  for a in anchors:
   x,y,w,h=a['rect'];box=(index*width+int(x*width),margin+int(y*height),index*width+int((x+w)*width),margin+int((y+h)*height))
   draw.rectangle(box,outline=color if index==0 else '#5eafff',width=3);draw.text((box[0],max(margin,box[1]-12)),a['role'],fill='white')
 draw.text((12,8),'ACTUAL: '+result['status'],fill=color)
 draw.text((12,28),' / '.join(result['reasons']),fill='white')
 draw.text((width+12,8),'REFERENCIA DEL MISMO JUEGO' if reference else 'SIN REFERENCIA APROBADA: comprobacion de instrumentos visibles',fill='#5eafff')
 output=io.BytesIO();canvas.save(output,format='JPEG',quality=70);return output.getvalue()

if __name__=='__main__':
 if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('GitHub Actions only')
 payload=json.load(sys.stdin);image=Image.open(io.BytesIO(base64.b64decode(payload['image'])))
 result=analyze(image,provider=payload['provider'],game_id=payload['gameId'],reference=payload.get('reference'))
 result['preview']=base64.b64encode(preview(image,result,payload.get('reference'))).decode()
 print(json.dumps(result,separators=(',',':')))
