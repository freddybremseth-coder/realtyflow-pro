import assert from "node:assert/strict";
import test from "node:test";
import {publishFacebookPageReel} from "./remaster-facebook-reel-publisher";

const videoUrl="https://media.example.com/storage/v1/object/public/remaster-reels/one.mp4";
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
test("Facebook Reel uses real video upload phases and the exact connected Page",async()=>{
  const calls:Array<{url:string,method:string,body:string,headers:Headers}>=[];
  const http:typeof fetch=async(input,init)=>{
    const url=String(input),method=init?.method||"GET",headers=new Headers(init?.headers);
    calls.push({url,method,body:String(init?.body||""),headers});
    if(url.includes("/me?"))return response({id:"123456789"});
    if(url.includes("rupload.facebook.com"))return response({success:true});
    if(String(init?.body).includes("upload_phase=start"))
      return response({video_id:"987654321",upload_url:"https://rupload.facebook.com/video-upload/v25.0/987654321"});
    return response({success:true});
  };
  const result=await publishFacebookPageReel({pageId:"123456789",accessToken:"private-page-token",videoUrl,title:"Reel",description:"Olives"},http);
  assert.equal(result.videoId,"987654321");
  assert.equal(calls.length,4);
  assert.equal(calls[0].method,"GET");
  assert.equal(calls[2].headers.get("file_url"),videoUrl);
  assert.equal(calls[2].headers.get("Authorization"),"OAuth private-page-token");
  assert.match(calls[3].body,/upload_phase=finish/);
  assert.match(calls[3].body,/video_state=PUBLISHED/);
});
test("rejects wrong Page token before any Reel creation",async()=>{
  let count=0;
  const http:typeof fetch=async()=>{count++;return response({id:"99999999"});};
  await assert.rejects(publishFacebookPageReel({pageId:"123456789",accessToken:"token",videoUrl,title:"t",description:"d"},http),/WRONG_PAGE/);
  assert.equal(count,1);
});
test("does not send bearer token to untrusted upload URL",async()=>{
  let count=0;
  const http:typeof fetch=async(input,init)=>{
    count++;
    if(String(input).includes("/me?"))return response({id:"123456789"});
    return response({video_id:"987654321",upload_url:"https://evil.example/upload/987654321"});
  };
  await assert.rejects(publishFacebookPageReel({pageId:"123456789",accessToken:"token",videoUrl,title:"t",description:"d"},http),/UPLOAD_URL_INVALID/);
  assert.equal(count,2);
});
