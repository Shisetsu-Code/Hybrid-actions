function messages(error){const parts=[];for(let e=error;e&&parts.length<5;e=e.cause)parts.push(String(e.message||e));return parts.join(' ');}
export function providerAccessDenied(error){return /(?:Provider|public) DEMO HTTP (403|429)\b/.test(messages(error));}
export async function captureWithRetries(capture,{sleep=ms=>new Promise(done=>setTimeout(done,ms))}={}){
 for(let attempt=1;;attempt++){
  try{return await capture();}
  catch(error){
   const message=messages(error);
   if(attempt>=3||providerAccessDenied(error)||!(/Timeout \d+ms exceeded|net::ERR_(CONNECTION_RESET|TIMED_OUT)|public DEMO HTTP 5\d\d/.test(message)))throw error;
   await sleep(20000*attempt);
  }
 }
}
