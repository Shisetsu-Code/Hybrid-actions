import importlib.util, unittest, io, base64
from unittest.mock import patch
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
 def test_valid_intro_remains_actionable_with_a_base_reference(self):
  image=shot('BALANCE 1000    BET 0.20    SPIN');data=io.BytesIO();image.save(data,format='JPEG')
  ref={'provider':'sample','gameId':'one','image':base64.b64encode(data.getvalue()).decode(),'anchors':validator.analyze(image,provider='sample',game_id='one')['anchors']}
  self.assertEqual(validator.analyze(shot('START'),provider='sample',game_id='one',reference=ref)['status'],'intro')
 def test_dialog_covering_the_game_does_not_pass_unchanged_instrument_labels(self):
  image=shot('BALANCE 1000    BET 0.20    SPIN');data=io.BytesIO();image.save(data,format='JPEG')
  ref={'provider':'sample','gameId':'one','image':base64.b64encode(data.getvalue()).decode(),'anchors':validator.analyze(image,provider='sample',game_id='one')['anchors']}
  changed=image.copy();ImageDraw.Draw(changed).rectangle((180,120,820,500),fill='white')
  result=validator.analyze(changed,provider='sample',game_id='one',reference=ref)
  self.assertNotEqual(result['status'],'ready')
 def test_small_idle_animation_does_not_invalidate_instruments(self):
  image=shot('BALANCE 1000    BET 0.20    SPIN');data=io.BytesIO();image.save(data,format='JPEG')
  ref={'provider':'sample','gameId':'one','image':base64.b64encode(data.getvalue()).decode(),'anchors':validator.analyze(image,provider='sample',game_id='one')['anchors']}
  changed=image.copy();ImageDraw.Draw(changed).ellipse((410,250,450,290),fill='#885544')
  self.assertEqual(validator.analyze(changed,provider='sample',game_id='one',reference=ref)['status'],'ready')
 def test_approved_intro_button_can_match_when_ocr_cannot_read_its_font(self):
  image=shot('START');data=io.BytesIO();image.save(data,format='JPEG')
  ref={'provider':'sample','gameId':'one','stage':'intro','image':base64.b64encode(data.getvalue()).decode(),'anchors':[{'role':'start','rect':[.09,.80,.20,.12]}]}
  with patch.object(validator,'read_words',return_value=[]):
   result=validator.analyze(image,provider='sample',game_id='one',reference=ref)
  self.assertEqual(result['status'],'intro')
if __name__=='__main__':unittest.main()
