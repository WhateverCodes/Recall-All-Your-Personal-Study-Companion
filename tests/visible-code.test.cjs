const test=require('node:test'),assert=require('node:assert/strict');const {visibleCode}=require('../extension/reading.js');
test('captures only visible rendered editor lines without reading input fields',()=>{
 const line=(text,top,hidden=false)=>({innerText:text,getBoundingClientRect:()=>({top,bottom:top+20}),closest:()=>hidden?{}:null});
 const lines=[line('values = list(map(int, input().split()))',10),line('values.append(42)',35),line('offscreen secret',1000),line('hidden secret',60,true)];
 const editor={matches:()=>true,getBoundingClientRect:()=>({top:0,bottom:500,left:0,right:500,width:500,height:500}),querySelectorAll:()=>lines};
 const doc={querySelectorAll:selector=>{assert.ok(!selector.includes('textarea'));return [editor];}};
 assert.equal(visibleCode(doc,600,800)[0].text,'values = list(map(int, input().split()))\nvalues.append(42)');assert.deepEqual(visibleCode(doc,600,0),[]);
});
