"""GitHub-runner image gate. OCR is local to the runner; no image is sent to an AI."""
import base64, io, json, os, re, sys, unicodedata, time
from PIL import Image, ImageDraw, ImageStat, ImageChops, ImageOps
import pytesseract
os.environ.setdefault('OMP_THREAD_LIMIT','1')

VERSION='3'
if os.environ.get('TESSERACT_CMD'):pytesseract.pytesseract.tesseract_cmd=os.environ['TESSERACT_CMD']
class OCRWords(list):
 def __init__(self):super().__init__();self.passes=[]
LABELS={'balance':{'balance','saldo','credit','credits','credito','creditos','credi'},
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
 words=OCRWords()
 # Scan the whole image plus enlarged toolbar/action areas. Coordinates always
 # map back to this game's original JPEG, never to another provider's layout.
 for name,region,scale,psm in [('scene',(0,0,1,1),1,11),('toolbar',(0,.68,1,.32),2,6),('actions',(.12,.56,.76,.42),2,11),('footer',(0,.72,1,.28),3,11),('entry',(.3,.68,.4,.24),3,11),('balance',(0,.80,.45,.20),3,11)]:
  started=time.monotonic()
  part=crop(image,region)
  # Bound pixel cost for mobile screenshots; map OCR boxes through the actual
  # scale, including fractional scales after capping large input dimensions.
  scale=min(scale,1800/max(part.size))
  if scale!=1:part=ImageOps.autocontrast(part.convert('L')).resize((max(1,round(part.width*scale)),max(1,round(part.height*scale))))
  try:
   data=pytesseract.image_to_data(part,lang='eng+spa',config='--psm '+str(psm),output_type=pytesseract.Output.DICT,timeout=5)
   words.passes.append({'name':name,'status':'ok','durationMs':round((time.monotonic()-started)*1000)})
  except Exception as error:
   code='timeout' if isinstance(error,RuntimeError) and 'timeout' in str(error).lower() else 'binary-missing' if isinstance(error,pytesseract.TesseractNotFoundError) else 'engine-error' if isinstance(error,pytesseract.TesseractError) else 'processing-error'
   words.passes.append({'name':name,'status':'error','errorCode':code,'durationMs':round((time.monotonic()-started)*1000)})
   continue
  for i,word in enumerate(data['text']):
   if not word.strip() or float(data['conf'][i])<25:continue
   entry={'word':normalized(word.strip()),'x':region[0]*image.width+data['left'][i]/scale,'y':region[1]*image.height+data['top'][i]/scale,'w':data['width'][i]/scale,'h':data['height'][i]/scale,'confidence':float(data['conf'][i])}
   existing=next((w for w in words if w['word']==entry['word'] and abs(w['x']-entry['x'])<12 and abs(w['y']-entry['y'])<8),None)
   if existing is None:words.append(entry)
   elif entry['confidence']>existing['confidence']:existing.update(entry)
 return words

def intro_action(words,image):
 # Only complete entry prompts qualify. Never click a word extracted from a
 # purchase, spin, autoplay or stake confirmation sentence.
 patterns=[r'(?:click|tap|press)(?: anywhere)? to (?:continue|start|begin)',
           r'(?:click|tap|press) anywhere(?: to (?:continue|start|begin))?',
           r'(?:haz clic|pulsa|toca|presiona)(?: en cualquier (?:parte|lugar))? para (?:continuar|comenzar|iniciar)',
           r'(?:start|continue|continuar|comenzar|iniciar)']
 for seed in words:
  line=sorted([w for w in words if abs((w['y']+w['h']/2)-(seed['y']+seed['h']/2))<max(5,min(seed['h'],w['h'])*.55)],key=lambda w:w['confidence'],reverse=True)
  unique=[]
  for w in line:
   if not any(max(0,min(w['x']+w['w'],v['x']+v['w'])-max(w['x'],v['x']))/max(1,min(w['w'],v['w']))>.7 for v in unique):unique.append(w)
  unique=sorted([w for w in unique if re.sub(r'[^a-z]','',w['word'])],key=lambda w:w['x'])
  groups=[]
  for word in unique:
   if not groups or word['x']-(groups[-1][-1]['x']+groups[-1][-1]['w'])>max(image.width*.03,min(word['h'],groups[-1][-1]['h'])*2):groups.append([])
   groups[-1].append(word)
  for group in groups:
   text=' '.join(re.sub(r'[^a-z ]','',w['word']).strip() for w in group).strip()
   if not any(re.fullmatch(p,text) for p in patterns):continue
   if min(w['confidence'] for w in group)<50:continue
   left=min(w['x'] for w in group);top=min(w['y'] for w in group)
   right=max(w['x']+w['w'] for w in group);bottom=max(w['y']+w['h'] for w in group)
   return {'kind':'intro','text':text,'rect':[left/image.width,top/image.height,(right-left)/image.width,(bottom-top)/image.height]}
 return None

def balance_evidence(words,image):
 for label in words:
  if re.sub(r'[^a-z]','',label['word']) not in LABELS['balance'] or label['confidence']<40:continue
  # A nearby amount is essential: title text or jackpot values are not balance.
  for amount in words:
   token=amount['word'].strip('$€£:')
   if amount['confidence']<50 or not re.fullmatch(r'\d+(?:[.,]\d+)*',token):continue
   same_line=abs(amount['y']-label['y'])<max(label['h'],amount['h'])*.8 and 0<=amount['x']-label['x']-label['w']<image.width*.18
   below=0<=amount['y']-label['y']<max(label['h']*3,image.height*.055) and abs(amount['x']-label['x'])<image.width*.09
   if same_line and any(re.sub(r'[^a-z]','',other['word']) in (LABELS['bet']|{'jackpot','win','premio'}) and label['x']<other['x']<amount['x'] and abs(other['y']-label['y'])<max(label['h'],other['h']) for other in words):continue
   if same_line or below:
    return {'rect':[label['x']/image.width,label['y']/image.height,label['w']/image.width,label['h']/image.height], 'amount':token}
 return None
def analyze(image,*,provider,game_id,reference=None):
 image=image.convert('RGB')
 result={'validatorVersion':VERSION,'provider':provider,'gameId':game_id,'status':'uncertain','reasons':[],'anchors':[]}
 if image.width<160 or image.height<140 or max(ImageStat.Stat(image.resize((64,64))).stddev)<4:
  result['reasons']=['empty-or-small-image'];return result
 words=read_words(image)
 passes=getattr(words,'passes',[])
 result['ocr']={'passes':passes,'wordCount':len(words)}
 # If the full scene could not be inspected, cropped controls cannot prove
 # that there is no blocking message elsewhere in the game.
 if passes and passes[0]['status']!='ok':
  result['reasons']=['validator-unavailable' if all(p['status']!='ok' for p in passes) else 'ocr-scene-unavailable'];return result
 text=' '.join(w['word'] for w in words)
 blockers=[('blocked',r'not available in your country|geograph|access denied|attention required|restricted|no esta disponible|blocked|forbidden'),
           ('loading',r'loading|please wait|cargando|initializ|inicializ'),
           ('overlay',r'accept cookies|reject cookies|cookie settings|aceptar cookies|configurar cookies|legal gambling age|confirm your age|you must be over')]
 for status,pattern in blockers:
  if re.search(pattern,text):result.update(status=status,reasons=[status+'-screen']);return result
 if len(re.findall(r'\b\d+[,.]\d{2}\b',text))>=8 and re.search(r'\b(lineas|lines|apuesta|bet)\b',text):
  result.update(status='overlay',reasons=['stake-selection-covers-game']);return result
 result['balanceEvidence']=balance_evidence(words,image)
 action=intro_action(words,image)
 if action:
  result['introAction']=action
  result['anchors']=[{'role':'start','rect':action['rect'],'matched':False}]
  result.update(status='intro',reasons=['explicit-entry-prompt']);return result
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
 # An approved introduction is not a reference for the subsequent base scene.
 # Bootstrap the new base from its own visible instruments and numeric balance.
 if reference and reference.get('stage')=='intro' and result.get('balanceEvidence') and len(seen&{'balance','bet','spin'})>=2:
  reference=None
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
 if os.environ.get('GITHUB_ACTIONS')!='true' and os.environ.get('HYBRID_LOCAL_OCR_TEST')!='true':raise SystemExit('GitHub Actions or explicit offline OCR test only')
 payload=json.load(sys.stdin);image=Image.open(io.BytesIO(base64.b64decode(payload['image'])))
 result=analyze(image,provider=payload['provider'],game_id=payload['gameId'],reference=payload.get('reference'))
 result['preview']=base64.b64encode(preview(image,result,payload.get('reference'))).decode()
 print(json.dumps(result,separators=(',',':')))
