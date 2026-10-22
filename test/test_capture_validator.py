import importlib.util, unittest, io, base64
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
spec=importlib.util.spec_from_file_location('validator',Path(__file__).parents[1]/'scripts'/'validate-capture.py')
validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
def shot(text):
 image=Image.new('RGB',(1000,650),'#233344');draw=ImageDraw.Draw(image)
 draw.rectangle((80,80,920,500),fill='#774433')
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',28)
 draw.multiline_text((100,530),text,font=font,fill='white',spacing=8)
 return image
class CaptureValidationTests(unittest.TestCase):
 def test_loading_and_geoblocks_are_not_ready(self):
  for text,status in [('Loading. Please wait.','loading'),('This game is not available in your country.','blocked')]:
   self.assertEqual(validator.analyze(shot(text),provider='sample',game_id='one')['status'],status)
 def test_nonempty_image_without_instruments_is_uncertain(self):
  self.assertEqual(validator.analyze(shot('Beautiful game title'),provider='sample',game_id='one')['status'],'uncertain')
 def test_ready_requires_multiple_distinct_instruments(self):
  self.assertEqual(validator.analyze(shot('BALANCE 1000    BET 0.20    SPIN'),provider='sample',game_id='one')['status'],'ready')
  self.assertEqual(validator.analyze(shot('BET BET BET'),provider='sample',game_id='one')['status'],'uncertain')
 def test_same_game_reference_and_reference_pixels_are_checked(self):
  image=shot('BALANCE 1000    BET 0.20    SPIN');first=validator.analyze(image,provider='sample',game_id='one')
  data=io.BytesIO();image.save(data,format='JPEG')
  ref={'provider':'sample','gameId':'one','image':base64.b64encode(data.getvalue()).decode(),'anchors':first['anchors']}
  self.assertEqual(validator.analyze(image,provider='sample',game_id='one',reference=ref)['status'],'ready')
  ref['gameId']='another';self.assertEqual(validator.analyze(image,provider='sample',game_id='one',reference=ref)['status'],'uncertain')
if __name__=='__main__':unittest.main()
