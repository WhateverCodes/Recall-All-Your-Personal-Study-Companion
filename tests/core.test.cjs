const test=require('node:test');const assert=require('node:assert/strict');
const {step}=require('../extension/reading');const {cleanEntry,makeQuiz}=require('../core.cjs');
const {summarizePages}=require('../core.cjs');
test('ten paragraphs become one bounded summary with its source link',()=>{
  const entries=Array.from({length:10},(_,i)=>({url:'https://example.com/article',title:'Article',text:`Reading practice improves retention through repeated exposure to important concepts. Section ${i} discusses another aspect of learning and memory.`}));
  const [page]=summarizePages(entries);assert.equal(summarizePages(entries).length,1);assert.equal(page.sectionCount,10);
  assert.ok(page.summary.split(/\s+/).length<=90);assert.ok(!page.summary.includes('\n'));assert.equal(page.url,entries[0].url);
  assert.equal(summarizePages([...entries,{...entries[0],url:'https://example.com/other'}]).length,2);
});
test('fast scrolling, background tabs, short visibility, and inactivity do not count',()=>{
  const base={words:50,visibleFraction:1,idleSeconds:0,speed:0,elapsed:1,focused:true};
  for(const override of [{speed:900},{focused:false},{visibleFraction:.2},{idleSeconds:121}]) assert.equal(step({}, {...base,...override}).seconds,0);
});
test('slow visible reading qualifies while scheduler gaps cannot create instant credit',()=>{
  let state={};const sample={words:40,visibleFraction:.9,idleSeconds:0,speed:30,elapsed:1,focused:true};
  for(let i=0;i<9;i++)state=step(state,sample);assert.equal(state.qualified,true);
  assert.equal(step({}, {...sample,elapsed:500}).seconds,1.5);
});
test('source identifiers deduplicate and remove query secrets',()=>{
  const input={text:'A meaningful paragraph about understanding educational material.',url:'https://example.com/article?token=secret#p1'};
  const a=cleanEntry(input),b=cleanEntry({...input,url:'https://example.com/article'});
  assert.equal(a.id,b.id);assert.equal(a.url,'https://example.com/article');
  assert.throws(()=>cleanEntry({...input,url:'javascript:alert(1)'}));
});
test('local questions retain a verifiable source and answer',()=>{
  const entry=cleanEntry({text:'Photosynthesis transforms light energy into chemical energy that organisms can store.',url:'https://example.com/biology'});
  const [q]=makeQuiz([entry]);assert.ok(q.prompt.includes('________'));assert.ok(entry.text.includes(q.answer));assert.equal(q.source,entry.url);
});
