
const test=require('node:test'),assert=require('node:assert/strict');const {topicsFor,historyGroups}=require('../ui/view-models.js');
test('older server responses still populate topics from saved reading',()=>{const p={url:'https://example.com/stack',title:'Stacks',sectionCount:4};assert.deepEqual(topicsFor({pageSummaries:[p]}),[{...p,id:p.url}]);assert.deepEqual(topicsFor({topics:[],pageSummaries:[p]}),[]);});
test('history groups retakes and shows latest score without inventing old scores',()=>{const original={id:'a',createdAt:'2026-10-05T12:00:00Z',questions:[{id:'q'}]};const second={id:'b',originalQuizId:'a',attempt:2,createdAt:'2026-10-06T12:00:00Z',questions:[{id:'q'}],answers:{q:{correct:true}}};const groups=historyGroups([second],[original,second]);assert.equal(groups.length,1);assert.equal(groups[0].attempts.length,2);assert.equal(groups[0].latest.id,'b');assert.equal(groups[0].score,'100%');assert.equal(historyGroups([original])[0].score,'Not recorded');assert.equal(historyGroups([{...second,answers:{}}])[0].score,'Not answered');});
const {scoreReport}=require('../scores.cjs');
const {retakeBatch}=require('../test-history.cjs');
test('retaking an older test keeps its original date and name and updates its score',()=>{
 const original={id:'old',name:'SQL revision',createdAt:'2026-08-01T12:00:00Z',questions:[{id:'q',prompt:'Example',answer:'yes'}],answers:{q:{correct:false,answeredAt:'2026-08-01T12:01:00Z'}}};
 const recent={id:'recent',name:'Recent test',createdAt:'2026-10-14T12:00:00Z',questions:[],answers:{}};
 const stamp=Date.parse('2026-10-15T12:00:00Z');
 const {session}=retakeBatch([original,recent],['old'],stamp);
 assert.equal(session.name,original.name);
 session.answers[session.questions[0].id]={correct:true,value:'yes',answeredAt:new Date(stamp).toISOString()};
 const report=scoreReport([original,recent,session],stamp);
 // The dashboard may still hold pre-retake state when the newer score response arrives.
 const groups=historyGroups(report.history,[original,recent]);const row=groups.find(g=>g.id==='old');
 assert.equal(row.original.createdAt,original.createdAt);assert.equal(row.name,'SQL revision');assert.equal(row.attempts.length,2);assert.equal(row.latest.id,session.id);assert.equal(row.score,'100%');
 assert.equal(groups[0].id,'recent');assert.equal(row.attempts[0].answers.q.correct,false);
});

test('dashboard loads the shared history model instead of an obsolete embedded copy',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const dir=path.join(__dirname,'../ui');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
 assert(html.indexOf('src="view-models.js"')<html.indexOf('src="app.js"'));
 assert(!app.includes('function historyGroups('));
 const context={};vm.runInNewContext(fs.readFileSync(path.join(dir,'view-models.js'),'utf8'),context);
 const q={id:'a',name:'Test',createdAt:'2026-10-15T12:00:00Z',questions:[],answers:{}};
 assert.equal(context.RecallViews.historyGroups([q])[0].original.id,'a');
});
