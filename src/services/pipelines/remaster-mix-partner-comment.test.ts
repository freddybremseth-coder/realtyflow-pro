import assert from "node:assert/strict";
import test from "node:test";
import {buildRemasterPartnerComment} from "./remaster-mix-partner-comment";

const ART_ITEM={id:"paint-one",title:"A Work of Hope",imageUrl:"https://example.com/public.webp",detailUrl:"https://art.freddybremseth.com/verk/paint-one/"};
const ART_TWO={id:"paint-two",title:"Stillness in Gold",imageUrl:"https://example.com/public2.webp",detailUrl:"https://art.freddybremseth.com/verk/paint-two/"};
const BOOK_ITEM={id:"one",title:"The Facade of Justice",imageUrl:"https://example.com/cover.jpg",detailUrl:"https://books.freddybremseth.com/book/the-facade-of-justice"};
const MUSIC="https://remaster.freddybremseth.com/";

test("art detailed comment links precisely selected works, correct gallery, style and music",()=>{
  const comment=buildRemasterPartnerComment({brand:"art",style:"detailed",promotedItems:[
    ART_ITEM,ART_TWO,ART_ITEM,{...ART_ITEM,id:"offsite",detailUrl:"https://evil.example/verk/paint-one"}
  ],artStyles:["symbolic-realism"],artCollections:["human-condition"]});
  assert.match(comment,/A Work of Hope — https:\/\/art\.freddybremseth\.com\/verk\/paint-one\//);
  assert.match(comment,/Stillness in Gold/);
  assert.match(comment,/Selected art styles: symbolic realism/);
  assert.match(comment,/human condition/);
  assert.equal(comment.split("https://art.freddybremseth.com/verk/paint-one/").length-1,1);
  assert.doesNotMatch(comment,/evil\.example/);
  assert.ok(comment.includes(MUSIC));
});
test("art short comment includes at most two selected links and does not include unrelated works",()=>{
  const works=[ART_ITEM,ART_TWO,{...ART_ITEM,id:"paint-three",detailUrl:"https://art.freddybremseth.com/verk/paint-three/"}];
  const comment=buildRemasterPartnerComment({brand:"art",style:"short",promotedItems:works,artStyles:["symbolic-realism"]});
  assert.match(comment,/paint-one/);assert.match(comment,/paint-two/);
  assert.doesNotMatch(comment,/paint-three|Selected art styles/);
});
test("books detailed comment includes real book route, series, edition and excludes off-site links",()=>{
  const comment=buildRemasterPartnerComment({brand:"books",style:"detailed",promotedItems:[
    BOOK_ITEM,{...BOOK_ITEM,id:"bad",detailUrl:"https://books.freddybremseth.com.evil.example/book/stolen"},
  ],bookSeries:["michael-thorne"],bookLanguages:["en"]});
  assert.match(comment,/The Facade of Justice — https:\/\/books\.freddybremseth\.com\/book\/the-facade-of-justice/);
  assert.match(comment,/Selected book series: michael thorne/);
  assert.match(comment,/Selected editions: en/);
  assert.doesNotMatch(comment,/evil\.example/);
  assert.ok(comment.includes(MUSIC));
});
test("ZenEcoHomes comment specifies selected property region without inventing individual listing URLs or guaranteed availability",()=>{
  const text=buildRemasterPartnerComment({brand:"zeneco",region:"north",visualTypes:["villas"],style:"detailed"});
  assert.match(text,/Costa Blanca North/);
  assert.match(text,/villas/);
  assert.match(text,/https:\/\/zenecohomes\.com\//);
  assert.match(text,/availability and prices can change/);
  assert.match(text,/screenshot of the property/);
  assert.ok(text.includes(MUSIC));
  assert.doesNotMatch(text,/\/property\//);
});
test("music-only comment contains only Re-Master Freddy, no unrelated brand promotion",()=>{
  const comment=buildRemasterPartnerComment({brand:"none"});
  assert.ok(comment.includes(MUSIC));
  assert.doesNotMatch(comment,/zenecohomes|art\.freddybremseth|books\.freddybremseth/i);
});
test("all brand variants obey YouTube 9k sanitizer limit even with many selected items",()=>{
  const works=Array.from({length:200},(_,i)=>({
    id:String(i),title:"A".repeat(240),imageUrl:"https://example.com/public.webp",
    detailUrl:"https://art.freddybremseth.com/verk/test-"+i+"/",
  }));
  const comment=buildRemasterPartnerComment({brand:"art",style:"detailed",promotedItems:works});
  assert.ok(comment.length<9000);
  assert.equal(comment.split("https://art.freddybremseth.com/verk/").length-1,6);
});
