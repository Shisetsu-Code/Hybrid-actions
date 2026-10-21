import {createHash} from 'node:crypto';
export async function verifyStoredCapture(cloud,id,{image:source,fetcher=fetch}={}){
 const item=(await cloud.call('/v1/items/'+encodeURIComponent(id))).item;
 if(item?.id!==id||!/^[a-f0-9]{64}$/.test(item.imageSha256||''))throw Error('D1 capture identity or image hash missing');
 const response=await fetcher(cloud.baseUrl+'/v1/items/'+encodeURIComponent(id)+'/image',{
  headers:{Authorization:'Bearer '+cloud.reviewToken},signal:AbortSignal.timeout(40000)});
 if(!response.ok)throw Error('R2 readback HTTP '+response.status);
 const image=Buffer.from(await response.arrayBuffer()),imageSha256=createHash('sha256').update(image).digest('hex');
 if(image.length<4||image[0]!==255||image[1]!==216||imageSha256!==item.imageSha256||
  source&&imageSha256!==createHash('sha256').update(source).digest('hex'))throw Error('Cloudflare JPEG integrity mismatch');
 return {item,image,bytes:image.length,imageSha256};
}
